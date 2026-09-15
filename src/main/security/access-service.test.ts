// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { AccessService } from './access-service'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function createServices(): { database: DatabaseManager; access: AccessService } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-access-test-'))
  directories.push(directory)
  const database = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  database.initialize()
  return { database, access: new AccessService(database.getNativeConnection()) }
}

describe('acceso local y onboarding', () => {
  it('guarda el perfil y nunca persiste el PIN en texto plano', () => {
    const { database, access } = createServices()
    try {
      expect(access.getState()).toMatchObject({ onboardingCompleted: false, locked: false })

      const state = access.completeOnboarding({
        name: 'Parqueadero Central',
        address: 'Carrera 10 # 12-34',
        phone: '300 123 4567',
        pin: '12345678',
      })
      expect(state).toMatchObject({
        onboardingCompleted: true,
        pinConfigured: true,
        locked: false,
        profile: { name: 'Parqueadero Central' },
      })

      const stored = database
        .getNativeConnection()
        .prepare("SELECT value FROM app_settings WHERE key = 'security.pinHash'")
        .get() as { value: string }
      expect(stored.value).toMatch(/^scrypt\$/)
      expect(stored.value).not.toContain('12345678')
    } finally {
      database.close()
    }
  })

  it('bloquea, rechaza un PIN incorrecto y permite retirar la protección', () => {
    const { database, access } = createServices()
    try {
      access.completeOnboarding({
        name: 'Parqueadero Central',
        address: 'Carrera 10 # 12-34',
        phone: '300 123 4567',
        pin: '12345678',
      })

      expect(access.lock()).toMatchObject({ locked: true })
      expect(access.canUseApplication()).toBe(false)
      expect(access.unlock('00000000')).toMatchObject({ success: false })
      expect(access.unlock('12345678')).toMatchObject({ success: true })
      expect(access.removePin('12345678')).toMatchObject({
        success: true,
        state: { pinConfigured: false, locked: false },
      })
    } finally {
      database.close()
    }
  })

  it('guarda y elimina el logo del perfil sin usar rutas del sistema', () => {
    const { database, access } = createServices()
    try {
      access.completeOnboarding({
        name: 'Parqueadero Central',
        address: 'Carrera 10 # 12-34',
        phone: '300 123 4567',
        pin: '',
      })
      const logoDataUrl = 'data:image/png;base64,aGVsbG8='
      expect(
        access.updateProfile({
          name: 'Parqueadero Central',
          address: 'Carrera 10 # 12-34',
          phone: '300 123 4567',
          logoDataUrl,
        }).profile,
      ).toMatchObject({ logoDataUrl })

      expect(
        access.updateProfile({
          name: 'Parqueadero Central',
          address: 'Carrera 10 # 12-34',
          phone: '300 123 4567',
          logoDataUrl: null,
        }).profile,
      ).toMatchObject({ logoDataUrl: null })
    } finally {
      database.close()
    }
  })
})
