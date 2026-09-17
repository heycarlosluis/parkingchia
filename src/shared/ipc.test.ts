import { describe, expect, it } from 'vitest'
import {
  completeOnboardingSchema,
  parkingProfileSchema,
  pinSchema,
  updateSettingsSchema,
} from './ipc'

describe('esquema IPC de configuración', () => {
  it('acepta únicamente propiedades conocidas y valores válidos', () => {
    expect(updateSettingsSchema.safeParse({ paperWidth: '58mm' }).success).toBe(true)
    expect(updateSettingsSchema.safeParse({ paperWidth: 'A4' }).success).toBe(false)
    expect(updateSettingsSchema.safeParse({ arbitraryChannel: true }).success).toBe(false)
  })

  it('valida el perfil y el PIN opcional del onboarding', () => {
    expect(
      completeOnboardingSchema.safeParse({
        name: 'Parqueadero Central',
        address: 'Carrera 10 # 12-34',
        phone: '300 123 4567',
        pin: '',
      }).success,
    ).toBe(true)
    expect(pinSchema.safeParse('12345678').success).toBe(true)
    expect(pinSchema.safeParse('1234').success).toBe(false)
    expect(
      parkingProfileSchema.safeParse({
        name: 'A',
        address: 'Calle 1',
        phone: 'sin teléfono',
      }).success,
    ).toBe(false)
  })

  it('valida el NIT del parqueadero y lo guarda sin separadores', () => {
    const profile = {
      name: 'Parqueadero Central',
      address: 'Carrera 10 # 12-34',
      phone: '300 123 4567',
    }
    expect(parkingProfileSchema.parse({ ...profile, nit: '800.197.268-4' }).nit).toBe('800197268-4')
    // Vaciar el campo elimina el NIT guardado.
    expect(parkingProfileSchema.parse({ ...profile, nit: '  ' }).nit).toBeNull()
    expect(parkingProfileSchema.safeParse({ ...profile, nit: '800.197.268-5' }).success).toBe(false)
    expect(parkingProfileSchema.safeParse({ ...profile, nit: '800197268' }).success).toBe(false)
  })

  it('acepta solo logos locales en formatos de imagen permitidos', () => {
    const profile = {
      name: 'Parqueadero Central',
      address: 'Carrera 10 # 12-34',
      phone: '300 123 4567',
    }
    expect(
      parkingProfileSchema.safeParse({
        ...profile,
        logoDataUrl: 'data:image/png;base64,aGVsbG8=',
      }).success,
    ).toBe(true)
    expect(
      parkingProfileSchema.safeParse({
        ...profile,
        logoDataUrl: 'file:///Users/operador/logo.png',
      }).success,
    ).toBe(false)
    expect(
      parkingProfileSchema.safeParse({
        ...profile,
        logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      }).success,
    ).toBe(false)
  })
})
