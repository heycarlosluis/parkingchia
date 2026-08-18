import { contextBridge, ipcRenderer } from 'electron'
import type { ParkingApi, UpdateState } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc'

const api: ParkingApi = {
  getAppStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_STATUS),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, input),
  listPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_LIST),
  printTestTicket: () => ipcRenderer.invoke(IPC_CHANNELS.PRINT_TEST),
  createBackup: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE),
  getUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  onUpdateState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATE_CHANGED, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATE_CHANGED, wrapped)
  },
}

contextBridge.exposeInMainWorld('parkingAPI', api)
