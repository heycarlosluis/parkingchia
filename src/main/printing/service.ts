import { BrowserWindow } from 'electron'
import type {
  ActiveSession,
  AppSettings,
  CashCloseSummary,
  EntryRegistration,
  ParkingProfile,
  PendingPayment,
  PrinterInfo,
  PrintResult,
} from '@shared/contracts'
import type { SettingsService } from '@main/settings/service'
import { MIN_PRINT_WIDTH_MM } from '@shared/ipc'
import type { AccessService } from '@main/security/access-service'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { ExitDocument, FreeExitTicket, ReceiptSnapshot } from '@main/parking/service'
import {
  contentWidthMm,
  createActiveSessionsTicketHtml,
  createCalibrationGuideHtml,
  createCashCloseReceiptHtml,
  createEntryTicketHtml,
  createExitReceiptHtml,
  createFreeExitTicketHtml,
  createMonthlyReceiptHtml,
  createPendingPaymentTicketHtml,
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
  printPendingPaymentTicket(
    pending: PendingPayment,
    options?: TicketRenderOptions,
  ): Promise<PrintResult>
  printExitReceipt(receipt: ReceiptSnapshot, options?: TicketRenderOptions): Promise<PrintResult>
  printFreeExitTicket(ticket: FreeExitTicket, options?: TicketRenderOptions): Promise<PrintResult>
  printExitDocument(document: ExitDocument, options?: TicketRenderOptions): Promise<PrintResult>
  printMonthlyReceipt(
    receipt: MonthlyReceiptSnapshot,
    options?: TicketRenderOptions,
  ): Promise<PrintResult>
  printCashCloseReceipt(summary: CashCloseSummary): Promise<PrintResult>
  printActiveSessions(sessions: ActiveSession[]): Promise<PrintResult>
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

  async printFreeExitTicket(
    ticket: FreeExitTicket,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createFreeExitTicketHtml(layout, profile, ticket, options),
      options.reprint
        ? 'El comprobante de salida se reimprimió como duplicado.'
        : 'El comprobante de salida se envió a la impresora.',
    )
  }

  /** Imprime lo que corresponda a una salida: su recibo o su comprobante sin cobro. */
  async printExitDocument(
    document: ExitDocument,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return document.kind === 'receipt'
      ? this.printExitReceipt(document.receipt, options)
      : this.printFreeExitTicket(document.ticket, options)
  }

  async printPendingPaymentTicket(
    pending: PendingPayment,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createPendingPaymentTicketHtml(layout, profile, pending, options),
      'El tiquete de pago pendiente se envió a la impresora.',
    )
  }

  async printMonthlyReceipt(
    receipt: MonthlyReceiptSnapshot,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createMonthlyReceiptHtml(layout, profile, receipt, options),
      options.reprint
        ? 'El recibo de la mensualidad se reimprimió como duplicado.'
        : 'El recibo de la mensualidad se envió a la impresora.',
    )
  }

  async printCashCloseReceipt(summary: CashCloseSummary): Promise<PrintResult> {
    return this.render(
      (layout, profile) => createCashCloseReceiptHtml(layout, profile, summary),
      'El recibo de cierre se envió a la impresora.',
    )
  }

  async printActiveSessions(sessions: ActiveSession[]): Promise<PrintResult> {
    const printedAt = new Date().toISOString()
    return this.render(
      (layout, profile) => createActiveSessionsTicketHtml(layout, profile, sessions, printedAt),
      'El listado del parqueo activo se envió a la impresora.',
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
          else if (isPrintCancellation(failureReason)) reject(new PrintCancelledError())
          else reject(new Error(failureReason || 'El sistema no completó la impresión'))
        })
      })
      return { printed: true, message: successMessage }
    } catch (error) {
      // Cerrar el diálogo del sistema no es una falla de la impresora.
      if (error instanceof PrintCancelledError) {
        return {
          printed: false,
          message: 'Impresión cancelada. Puedes reimprimir el documento cuando quieras.',
        }
      }
      return {
        printed: false,
        message: 'No fue posible imprimir. Revisa la impresora y vuelve a intentarlo.',
      }
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    }
  }
}

class PrintCancelledError extends Error {}

/** Electron informa «cancelled» cuando el operador cierra el diálogo del sistema. */
export function isPrintCancellation(failureReason: string | undefined): boolean {
  return /cancel/i.test(failureReason ?? '')
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
