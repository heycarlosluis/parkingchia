import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  type Listener = (payload?: unknown) => void

  const listeners = new Map<string, Set<Listener>>()
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    channel: undefined as string | undefined,
    on: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
      return updater
    }),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn(),
  }

  return {
    app: {
      getVersion: vi.fn(() => '0.1.0-alpha.1'),
      isPackaged: true,
    },
    emit(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload)
    },
    listeners,
    updater,
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: class BrowserWindow {},
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mocks.updater },
}))

import { UpdateService } from './service'

describe('UpdateService', () => {
  beforeEach(() => {
    mocks.listeners.clear()
    mocks.app.isPackaged = true
    mocks.updater.autoDownload = true
    mocks.updater.autoInstallOnAppQuit = true
    mocks.updater.allowPrerelease = true
    mocks.updater.channel = undefined
    vi.clearAllMocks()
  })

  it('conserva el canal que electron-updater deriva de la versión instalada', () => {
    new UpdateService(() => [])

    expect(mocks.updater.autoDownload).toBe(false)
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false)
    expect(mocks.updater.allowPrerelease).toBe(true)
    expect(mocks.updater.channel).toBeUndefined()
  })

  it('publica el estado de una actualización disponible', () => {
    const send = vi.fn()
    const service = new UpdateService(() => [
      {
        isDestroyed: () => false,
        webContents: { send },
      } as never,
    ])

    mocks.emit('update-available', { version: '0.1.0-alpha.2' })

    expect(service.getState()).toMatchObject({
      status: 'available',
      currentVersion: '0.1.0-alpha.1',
      availableVersion: '0.1.0-alpha.2',
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('solo reinicia cuando la descarga terminó', () => {
    const service = new UpdateService(() => [])

    service.install()
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled()

    mocks.emit('update-downloaded', { version: '0.1.0-alpha.2' })
    service.install()

    expect(mocks.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})
