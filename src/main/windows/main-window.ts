import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { secureWindowNavigation } from '@main/security/external-links'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    title: 'Parking Chía',
    backgroundColor: '#f7f8f6',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  if (is.dev) {
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`Preload error (${preloadPath}):`, error)
    })
  }

  window.once('ready-to-show', () => window.show())

  const rendererPath = join(__dirname, '../renderer/index.html')
  const developmentUrl = is.dev ? process.env.ELECTRON_RENDERER_URL : undefined
  const applicationUrl = developmentUrl ?? pathToFileURL(rendererPath).toString()
  secureWindowNavigation(window, applicationUrl)
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(rendererPath)
  return window
}
