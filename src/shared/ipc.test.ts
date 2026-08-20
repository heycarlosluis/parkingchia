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
})
