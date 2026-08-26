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
import type { AccessService } from '@main/security/access-service'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { ReceiptSnapshot } from '@main/parking/service'
import {
  createCashCloseReceiptHtml,
  createEntryTicketHtml,
  createExitReceiptHtml,
  createMonthlyReceiptHtml,
  createTestTicketHtml,
  type TicketRenderOptions,
} from './ticket'

export interface TicketPrinter {
  listPrinters(): Promise<PrinterInfo[]>
  printTestTicket(): Promise<PrintResult>
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
      (paperWidth, profile) => createTestTicketHtml(paperWidth, profile),
      'El ticket de prueba se envió a la impresora.',
    )
  }

  async printEntryTicket(
    entry: EntryRegistration,
    options: TicketRenderOptions = {},
  ): Promise<PrintResult> {
    return this.render(
      (paperWidth, profile) => createEntryTicketHtml(paperWidth, profile, entry, options),
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
      (paperWidth, profile) => createExitReceiptHtml(paperWidth, profile, receipt, options),
      options.reprint
        ? 'El recibo se reimprimió como duplicado.'
        : 'El recibo se envió a la impresora.',
    )
  }

  async printMonthlyReceipt(receipt: MonthlyReceiptSnapshot): Promise<PrintResult> {
    return this.render(
      (paperWidth, profile) => createMonthlyReceiptHtml(paperWidth, profile, receipt),
      'El recibo de la mensualidad se envió a la impresora.',
    )
  }

  async printCashCloseReceipt(summary: CashCloseSummary): Promise<PrintResult> {
    return this.render(
      (paperWidth, profile) => createCashCloseReceiptHtml(paperWidth, profile, summary),
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
    buildHtml: (paperWidth: AppSettings['paperWidth'], profile: ParkingProfile | null) => string,
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
      const html = buildHtml(settings.paperWidth, this.access.getState().profile)
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const paperWidthMicrons = settings.paperWidth === '58mm' ? 58_000 : 80_000

      await new Promise<void>((resolve, reject) => {
        const options: Electron.WebContentsPrintOptions = {
          silent: !settings.showPrintDialog,
          printBackground: false,
          margins: { marginType: 'none' },
          pageSize: { width: paperWidthMicrons, height: 200_000 },
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
