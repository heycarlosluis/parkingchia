import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import type { ApiResult, ParkingApi, UpdateState } from '@shared/contracts'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

const updateState: UpdateState = {
  status: 'idle',
  currentVersion: '0.1.0-alpha.1',
  availableVersion: null,
  progress: null,
  message: 'Desactivadas durante el desarrollo.',
  canCheck: false,
}

const parkingApi: ParkingApi = {
  getAppStatus: vi.fn(async () =>
    ok({
      name: 'Parking Chía',
      version: '0.1.0-alpha.1',
      isPackaged: false,
      database: {
        connected: true,
        journalMode: 'WAL',
        foreignKeys: true,
        pathLabel: 'Datos locales',
      },
      activeSessions: 0,
    }),
  ),
  getSettings: vi.fn(async () =>
    ok({ printerName: null, paperWidth: '80mm' as const, showPrintDialog: true }),
  ),
  updateSettings: vi.fn(async (input) =>
    ok({ printerName: null, paperWidth: '80mm' as const, showPrintDialog: true, ...input }),
  ),
  listPrinters: vi.fn(async () => ok([])),
  printTestTicket: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  createBackup: vi.fn(async () => ok({ created: false, message: 'Cancelada.' })),
  getUpdateState: vi.fn(async () => ok(updateState)),
  checkForUpdates: vi.fn(async () => ok(updateState)),
  downloadUpdate: vi.fn(async () => ok(updateState)),
  installUpdate: vi.fn(async () => ok(undefined)),
  onUpdateState: vi.fn(() => () => undefined),
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'parkingAPI', { value: parkingApi, configurable: true })
}
