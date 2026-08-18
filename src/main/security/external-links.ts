import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shell, type BrowserWindow } from 'electron'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:'])

function isSafeExternalUrl(value: string): boolean {
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function secureWindowNavigation(window: BrowserWindow, applicationUrl: string): void {
  const applicationLocation = new URL(applicationUrl)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const isApplicationNavigation =
      target.protocol === 'file:' && applicationLocation.protocol === 'file:'
        ? path.normalize(fileURLToPath(target)).normalize('NFC') ===
          path.normalize(fileURLToPath(applicationLocation)).normalize('NFC')
        : target.origin === applicationLocation.origin

    if (!isApplicationNavigation) {
      event.preventDefault()
      if (isSafeExternalUrl(url)) void shell.openExternal(url)
    }
  })
}
