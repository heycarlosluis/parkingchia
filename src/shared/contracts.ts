export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: { code: string; message: string } }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type DatabaseStatus = {
  connected: boolean
  journalMode: string
  foreignKeys: boolean
  pathLabel: string
}

export type AppStatus = {
  name: string
  version: string
  isPackaged: boolean
  database: DatabaseStatus
  activeSessions: number
}

export type PaperWidth = '58mm' | '80mm'

export type AppSettings = {
  printerName: string | null
  paperWidth: PaperWidth
  showPrintDialog: boolean
}

export type PrinterInfo = {
  name: string
  displayName: string
  isDefault: boolean
  status: number
}

export type PrintResult = {
  printed: boolean
  message: string
}

export type BackupResult = {
  created: boolean
  message: string
}

export type UpdateStateName =
  'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export type UpdateState = {
  status: UpdateStateName
  currentVersion: string
  availableVersion: string | null
  progress: number | null
  message: string
  canCheck: boolean
}

export interface ParkingApi {
  getAppStatus: () => Promise<ApiResult<AppStatus>>
  getSettings: () => Promise<ApiResult<AppSettings>>
  updateSettings: (input: Partial<AppSettings>) => Promise<ApiResult<AppSettings>>
  listPrinters: () => Promise<ApiResult<PrinterInfo[]>>
  printTestTicket: () => Promise<ApiResult<PrintResult>>
  createBackup: () => Promise<ApiResult<BackupResult>>
  getUpdateState: () => Promise<ApiResult<UpdateState>>
  checkForUpdates: () => Promise<ApiResult<UpdateState>>
  downloadUpdate: () => Promise<ApiResult<UpdateState>>
  installUpdate: () => Promise<ApiResult<void>>
  onUpdateState: (listener: (state: UpdateState) => void) => () => void
}
