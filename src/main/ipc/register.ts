import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { ApiResult, AppStatus, BackupResult } from '@shared/contracts'
import { IPC_CHANNELS, updateSettingsSchema } from '@shared/ipc'
import type { DatabaseManager } from '@main/database/connection'
import type { ElectronTicketPrinter } from '@main/printing/service'
import type { SettingsService } from '@main/settings/service'
import type { UpdateService } from '@main/updates/service'

type Services = {
  database: DatabaseManager
  settings: SettingsService
  printing: ElectronTicketPrinter
  updates: UpdateService
}

function success<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function failure(code: string, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } }
}

async function safely<T>(operation: () => T | Promise<T>): Promise<ApiResult<T>> {
  try {
    return success(await operation())
  } catch {
    return failure(
      'OPERATION_FAILED',
      'No fue posible completar la operación. Vuelve a intentarlo.',
    )
  }
}

export function registerIpcHandlers(services: Services): void {
  ipcMain.handle(IPC_CHANNELS.APP_STATUS, () =>
    safely<AppStatus>(() => {
      const row = services.database
        .getNativeConnection()
        .prepare("SELECT count(*) AS total FROM parking_sessions WHERE status = 'active'")
        .get() as { total: number }
      return {
        name: 'Parking Chía',
        version: app.getVersion(),
        isPackaged: app.isPackaged,
        database: services.database.getStatus(),
        activeSessions: row.total,
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => safely(() => services.settings.get()))
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, rawInput: unknown) =>
    safely(() => {
      const parsed = updateSettingsSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new Error('Ajustes no válidos')
      }
      return services.settings.update(parsed.data)
    }),
  )
  ipcMain.handle(IPC_CHANNELS.PRINTERS_LIST, () => safely(() => services.printing.listPrinters()))
  ipcMain.handle(IPC_CHANNELS.PRINT_TEST, () => safely(() => services.printing.printTestTicket()))

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, () =>
    safely<BackupResult>(async () => {
      const defaultName = `parkingchia-backup-${new Date().toISOString().slice(0, 10)}.sqlite`
      const result = await dialog.showSaveDialog({
        title: 'Guardar copia de seguridad',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Base de datos SQLite', extensions: ['sqlite'] }],
      })
      if (result.canceled || !result.filePath) {
        return { created: false, message: 'No se creó ninguna copia de seguridad.' }
      }
      await services.database.backupTo(result.filePath)
      services.database
        .getNativeConnection()
        .prepare(
          'INSERT INTO audit_logs (id, action, entity_type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          randomUUID(),
          'database.backup_created',
          'database',
          'local-operator',
          JSON.stringify({ destination: 'user-selected' }),
          new Date().toISOString(),
        )
      return { created: true, message: 'Copia de seguridad creada correctamente.' }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, () => safely(() => services.updates.getState()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => safely(() => services.updates.check()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, () => safely(() => services.updates.download()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () =>
    safely(() => {
      services.updates.install()
    }),
  )
}

export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
}
