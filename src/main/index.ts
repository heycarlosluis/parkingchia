import path from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { DatabaseManager } from '@main/database/connection'
import { registerIpcHandlers, unregisterIpcHandlers } from '@main/ipc/register'
import { ElectronTicketPrinter } from '@main/printing/service'
import { AccessService } from '@main/security/access-service'
import { SettingsService } from '@main/settings/service'
import { CashService } from '@main/cash/service'
import { EmployeeService } from '@main/employee/service'
import { MonthlyService } from '@main/monthly/service'
import { ParkingService } from '@main/parking/service'
import { TariffService } from '@main/tariffs/service'
import { UpdateService } from '@main/updates/service'
import { createMainWindow } from '@main/windows/main-window'

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'parkingchia-development'))
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let databaseManager: DatabaseManager | null = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app
    .whenReady()
    .then(() => {
      electronApp.setAppUserModelId('com.heycarlosluis.parkingchia')

      const migrationsPath = app.isPackaged
        ? path.join(process.resourcesPath, 'drizzle')
        : path.join(app.getAppPath(), 'drizzle')
      databaseManager = new DatabaseManager(
        path.join(app.getPath('userData'), 'parkingchia.sqlite'),
        migrationsPath,
      )
      databaseManager.initialize()

      mainWindow = createMainWindow()
      const settings = new SettingsService(databaseManager.getNativeConnection())
      const access = new AccessService(databaseManager.getNativeConnection())
      const printing = new ElectronTicketPrinter(() => mainWindow, settings, access)
      const updates = new UpdateService(() => BrowserWindow.getAllWindows())
      const tariffs = new TariffService(databaseManager.getNativeConnection())
      const cash = new CashService(databaseManager.getNativeConnection())
      const employees = new EmployeeService(databaseManager.getNativeConnection())
      const monthly = new MonthlyService(databaseManager.getNativeConnection(), cash)
      const parking = new ParkingService(
        databaseManager.getNativeConnection(),
        tariffs,
        monthly,
        cash,
      )
      registerIpcHandlers({
        database: databaseManager,
        settings,
        printing,
        updates,
        access,
        tariffs,
        parking,
        monthly,
        cash,
        employees,
      })
      updates.scheduleInitialCheck()

      app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
      })
    })
    .catch(() => {
      dialog.showErrorBox(
        'Parking Chía no pudo iniciar',
        'No fue posible preparar los datos locales. Cierra la aplicación y vuelve a intentarlo.',
      )
      app.quit()
    })

  app.on('before-quit', () => {
    unregisterIpcHandlers()
    databaseManager?.close()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
