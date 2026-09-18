import { BrowserWindow } from 'electron'
import type {
  AppSettings,
  CashCloseSummary,
  EntryRegistration,
  ParkingProfile,
  PrinterInfo,
  PrintResult,
} from '@shared/contracts'
import type { SettingsService } from '@main/settings/service'
import { MIN_PRINT_WIDTH_MM } from '@shared/ipc'
import type { AccessService } from '@main/security/access-service'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { ReceiptSnapshot } from '@main/parking/service'
import {
  contentWidthMm,
  createCalibrationGuideHtml,
  createCashCloseReceiptHtml,
  createEntryTicketHtml,
  createExitReceiptHtml,
  createMonthlyReceiptHtml,
  createTestTicketHtml,
  PRINTABLE_WIDTH_MM,
  type PrintLayout,
  type TicketRenderOptions,
} from './ticket'

export interface TicketPrinter {
  listPrinters(): Promise<PrinterInfo[]>
  printTestTicket(): Promise<PrintResult>
  printCalibrationGuide(): Promise<PrintResult>
  printEntryTicket(entry: EntryRegistration, options?: TicketRenderOptions): Promise<PrintResult>
  printExitReceipt(receipt: ReceiptSnapshot, options?: TicketRenderOptions): Promise<PrintResult>
  printMonthlyReceipt(receipt: MonthlyReceiptSnapshot): Promise<PrintResult>
  printCashCloseReceipt(summary: CashCloseSummary): Promise<PrintResult>
}

export class ElectronTicketPrinter implements TicketPrinter {
  constructor(
    private readonly parentWindow: () => BrowserWindow | null,
    private readonly settings: SettingsService,
    private readonly access: AccessService,
  ) {}

  async listPrinters(): Promise<PrinterInfo[]> {
    const window = this.parentWindow()
    if (!window || window.isDestroyed()) return []
    const printers = await window.webContents.getPrintersAsync()
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: false,
      status: 0,
    }))
  }

  async printTestTicket(): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createTestTicketHtml(layout, profile),
      'El ticket de prueba se envió a la impresora.',
    )
  }

  async printCalibrationGuide(): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createCalibrationGuideHtml(layout, profile),
      'La guía de ajuste se envió a la impresora.',
    )
  }

  async printEntryTicket(
    entry: EntryRegistration,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createEntryTicketHtml(layout, profile, entry, options),
      options.reprint
        ? 'El tiquete de ingreso se reimprimió como duplicado.'
        : 'El tiquete de ingreso se envió a la impresora.',
    )
  }

  async printExitReceipt(
    receipt: ReceiptSnapshot,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createExitReceiptHtml(layout, profile, receipt, options),
      options.reprint
        ? 'El recibo se reimprimió como duplicado.'
        : 'El recibo se envió a la impresora.',
    )
  }

  async printMonthlyReceipt(receipt: MonthlyReceiptSnapshot): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createMonthlyReceiptHtml(layout, profile, receipt),
      'El recibo de la mensualidad se envió a la impresora.',
    )
  }

  async printCashCloseReceipt(summary: CashCloseSummary): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createCashCloseReceiptHtml(layout, profile, summary),
      'El recibo de cierre se envió a la impresora.',
    )
  }

  /**
   * Envía un documento a la impresora configurada.
   *
   * Nunca lanza: la operación de negocio ya quedó registrada y la impresión
   * es un efecto secundario que el operador puede reintentar.
   */
  private async render(
    buildHtml: (layout: PrintLayout, profile: ParkingProfile | null) => string,
    successMessage: string,
  ): Promise<PrintResult> {
    const settings = this.settings.get()
    const printers = await this.listPrinters()
    if (printers.length === 0) {
      return { printed: false, message: 'No hay impresoras disponibles en el sistema.' }
    }

    if (
      settings.printerName &&
      !printers.some((printer) => printer.name === settings.printerName)
    ) {
      return {
        printed: false,
        message: 'La impresora guardada ya no está disponible. Selecciona otra impresora.',
      }
    }

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    })

    try {
      const layout = layoutFromSettings(settings)
      const html = buildHtml(layout, this.access.getState().profile)
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pageSize = await measurePage(printWindow, layout)

      await new Promise<void>((resolve, reject) => {
        const options: Electron.WebContentsPrintOptions = {
          silent: !settings.showPrintDialog,
          printBackground: false,
          // Respeta los márgenes que declara el driver: el contenido se centra y
          // se encoge dentro de ellos en lugar de salirse del área del cabezal.
          margins: { marginType: 'printableArea' },
          pageSize,
        }
        if (settings.printerName) options.deviceName = settings.printerName
        printWindow.webContents.print(options, (success, failureReason) => {
          if (success) resolve()
          else reject(new Error(failureReason || 'El sistema canceló la impresión'))
        })
      })
      return { printed: true, message: successMessage }
    } catch {
      return {
        printed: false,
        message: 'No fue posible imprimir. Revisa la impresora y vuelve a intentarlo.',
      }
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    }
  }
}

const MICRONS_PER_MM = 1000
const MICRONS_PER_CSS_PIXEL = 25_400 / 96
/** Evita páginas degeneradas si el documento no pudo medirse. */
const MIN_PAGE_HEIGHT_MM = 40
/** Holgura ante diferencias mínimas entre la maqueta en pantalla y la de impresión. */
const PAGE_HEIGHT_SLACK_MM = 4
/**
 * Se mide con el contenido algo más angosto que el pedido.
 *
 * Si el driver declara márgenes, el texto se reacomoda en menos ancho y el
 * documento crece; medir con este margen evita que la última línea caiga en
 * una segunda hoja, a cambio de unos milímetros de papel en blanco.
 */
const MEASURE_WIDTH_REDUCTION_MM = 8

export function layoutFromSettings(settings: AppSettings): PrintLayout {
  return {
    paperWidth: settings.paperWidth,
    widthMm: settings.printWidthMm,
    offsetMm: settings.printOffsetMm,
  }
}

/**
 * Página del ancho imprimible del rollo y del alto del documento.
 *
 * Un alto fijo desperdicia rollo en los recibos cortos y parte en dos hojas
 * los tiquetes largos con logo, QR y Code 128.
 */
async function measurePage(
  window: BrowserWindow,
  layout: PrintLayout,
): Promise<{ width: number; height: number }> {
  const measureWidthMm = Math.max(
    MIN_PRINT_WIDTH_MM,
    contentWidthMm(layout) - MEASURE_WIDTH_REDUCTION_MM,
  )
  const heightPx: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const body = document.body
      const previous = body.style.width
      body.style.width = '${measureWidthMm}mm'
      const height = Math.ceil(body.getBoundingClientRect().height)
      body.style.width = previous
      return height
    })()`,
  )
  const contentMicrons =
    typeof heightPx === 'number' && Number.isFinite(heightPx) ? heightPx * MICRONS_PER_CSS_PIXEL : 0
  const height = Math.max(
    MIN_PAGE_HEIGHT_MM * MICRONS_PER_MM,
    Math.ceil(contentMicrons + PAGE_HEIGHT_SLACK_MM * MICRONS_PER_MM),
  )
  // La página conserva al menos el ancho del cabezal aunque el contenido se
  // ajuste a mano: así un contenido más angosto queda centrado sobre el papel.
  const widthMm = Math.max(PRINTABLE_WIDTH_MM[layout.paperWidth], contentWidthMm(layout))
  return { width: widthMm * MICRONS_PER_MM, height }
}
