import { BrowserWindow } from 'electron'
import type { PrinterInfo, PrintResult } from '@shared/contracts'
import type { SettingsService } from '@main/settings/service'
import { createTestTicketHtml } from './ticket'

export interface TicketPrinter {
  listPrinters(): Promise<PrinterInfo[]>
  printTestTicket(): Promise<PrintResult>
}

export class ElectronTicketPrinter implements TicketPrinter {
  constructor(
    private readonly parentWindow: () => BrowserWindow | null,
    private readonly settings: SettingsService,
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
      const html = createTestTicketHtml(settings.paperWidth)
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
      return { printed: true, message: 'El ticket de prueba se envió a la impresora.' }
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
