import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'
import type { UpdateState } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc'

const { autoUpdater } = updater
const INSTALL_START_DELAY_MS = 250
const FORCE_EXIT_DELAY_MS = 5_000

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
  private installRequested = false

  constructor(
    private readonly windows: () => BrowserWindow[],
    private readonly prepareToInstall: () => void = () => undefined,
  ) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

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

  install(): UpdateState {
    if (!app.isPackaged || this.state.status !== 'downloaded' || this.installRequested) {
      return this.getState()
    }

    this.installRequested = true
    this.setState({
      status: 'installing',
      canCheck: false,
      message: 'Cerrando Parking Chía para instalar la actualización…',
    })

    setTimeout(() => this.startInstallation(), INSTALL_START_DELAY_MS)
    return this.getState()
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

  private startInstallation(): void {
    this.prepareToInstall()

    const forceExitTimer = setTimeout(() => app.exit(0), FORCE_EXIT_DELAY_MS)
    forceExitTimer.unref()

    for (const window of this.windows()) {
      if (!window.isDestroyed()) window.destroy()
    }

    // El instalador silencioso evita que NSIS quede esperando una ventana de
    // confirmación mientras Electron termina; el temporizador cubre un cierre
    // bloqueado por el runtime o por una ventana secundaria.
    autoUpdater.quitAndInstall(true, true)
  }
}
