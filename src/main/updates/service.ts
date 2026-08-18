import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'
import type { UpdateState } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc'

const { autoUpdater } = updater

const initialState = (): UpdateState => ({
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: null,
  message: app.isPackaged
    ? 'Listo para buscar actualizaciones.'
    : 'Las actualizaciones están desactivadas durante el desarrollo.',
  canCheck: app.isPackaged,
})

export class UpdateService {
  private state = initialState()

  constructor(private readonly windows: () => BrowserWindow[]) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.channel = 'latest'

    autoUpdater.on('checking-for-update', () => {
      this.setState({ status: 'checking', progress: null, message: 'Buscando actualizaciones…' })
    })
    autoUpdater.on('update-available', (info) => {
      this.setState({
        status: 'available',
        availableVersion: info.version,
        message: `La versión ${info.version} está disponible.`,
      })
    })
    autoUpdater.on('update-not-available', () => {
      this.setState({
        status: 'not-available',
        availableVersion: null,
        progress: null,
        message: 'Parking Chía está actualizado.',
      })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        status: 'downloading',
        progress: Math.round(progress.percent),
        message: 'Descargando actualización…',
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      autoUpdater.autoInstallOnAppQuit = true
      this.setState({
        status: 'downloaded',
        availableVersion: info.version,
        progress: 100,
        message: 'Actualización lista. Instálala cuando no haya una operación en curso.',
      })
    })
    autoUpdater.on('error', () => {
      this.setState({
        status: 'error',
        progress: null,
        message:
          'No fue posible consultar las actualizaciones. Puedes seguir trabajando sin conexión.',
      })
    })
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.getState()
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      this.setState({
        status: 'error',
        progress: null,
        message:
          'No fue posible consultar las actualizaciones. Puedes seguir trabajando sin conexión.',
      })
    }
    return this.getState()
  }

  async download(): Promise<UpdateState> {
    if (!app.isPackaged || this.state.status !== 'available') return this.getState()
    await autoUpdater.downloadUpdate()
    return this.getState()
  }

  install(): void {
    if (app.isPackaged && this.state.status === 'downloaded') {
      autoUpdater.quitAndInstall(false, true)
    }
  }

  scheduleInitialCheck(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), 4_000)
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    for (const window of this.windows()) {
      if (!window.isDestroyed())
        window.webContents.send(IPC_CHANNELS.UPDATE_STATE_CHANGED, this.state)
    }
  }
}
