// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { SettingsService } from './service'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function createSettings(): { database: DatabaseManager; settings: SettingsService } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-settings-test-'))
  directories.push(directory)
  const database = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  database.initialize()
  return { database, settings: new SettingsService(database.getNativeConnection()) }
}

describe('configuración de impresión', () => {
  it('usa el ancho automático y el contenido centrado en una instalación nueva', () => {
    const { database, settings } = createSettings()
    try {
      expect(settings.get()).toMatchObject({ printWidthMm: null, printOffsetMm: 0 })
    } finally {
      database.close()
    }
  })

  it('guarda el ajuste del papel sin tocar los demás valores', () => {
    const { database, settings } = createSettings()
    try {
      settings.update({ paperWidth: '80mm', showPrintDialog: false })
      settings.update({ printWidthMm: 64.5, printOffsetMm: -1.5 })
      expect(settings.get()).toMatchObject({
        paperWidth: '80mm',
        showPrintDialog: false,
        printWidthMm: 64.5,
        printOffsetMm: -1.5,
      })

      // Volver a automático conserva el desplazamiento.
      settings.update({ printWidthMm: null })
      expect(settings.get()).toMatchObject({ printWidthMm: null, printOffsetMm: -1.5 })
    } finally {
      database.close()
    }
  })

  it('vuelve al ajuste de fábrica al cambiar el ancho del papel', () => {
    const { database, settings } = createSettings()
    try {
      settings.update({ printWidthMm: 64, printOffsetMm: 2 })
      // 64 mm calibrados para 80 mm se saldrían de un rollo de 58 mm.
      expect(settings.update({ paperWidth: '58mm' })).toMatchObject({
        paperWidth: '58mm',
        printWidthMm: null,
        printOffsetMm: 0,
      })
      // Repetir el mismo papel no borra una calibración hecha después.
      settings.update({ printWidthMm: 46 })
      expect(settings.update({ paperWidth: '58mm' })).toMatchObject({ printWidthMm: 46 })
    } finally {
      database.close()
    }
  })
})

describe('cobro simplificado', () => {
  it('viene desactivado y se conserva al cambiar otros ajustes', () => {
    const { database, settings } = createSettings()
    try {
      expect(settings.get().simpleChargeMode).toBe(false)
      expect(settings.update({ simpleChargeMode: true }).simpleChargeMode).toBe(true)
      settings.update({ paperWidth: '58mm' })
      expect(settings.get().simpleChargeMode).toBe(true)
    } finally {
      database.close()
    }
  })

  it('audita cada cambio de modo y no los guardados que lo dejan igual', () => {
    const { database, settings } = createSettings()
    try {
      settings.update({ simpleChargeMode: true })
      settings.update({ simpleChargeMode: true })
      settings.update({ showPrintDialog: false })
      settings.update({ simpleChargeMode: false })
      const rows = database
        .getNativeConnection()
        .prepare(
          "SELECT details_json FROM audit_logs WHERE action = 'settings.simple_charge_mode_changed' ORDER BY rowid",
        )
        .all() as Array<{ details_json: string }>
      expect(rows.map((row) => JSON.parse(row.details_json))).toEqual([
        { enabled: true },
        { enabled: false },
      ])
    } finally {
      database.close()
    }
  })
})
