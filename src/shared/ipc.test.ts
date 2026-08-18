import { describe, expect, it } from 'vitest'
import { updateSettingsSchema } from './ipc'

describe('esquema IPC de configuración', () => {
  it('acepta únicamente propiedades conocidas y valores válidos', () => {
    expect(updateSettingsSchema.safeParse({ paperWidth: '58mm' }).success).toBe(true)
    expect(updateSettingsSchema.safeParse({ paperWidth: 'A4' }).success).toBe(false)
    expect(updateSettingsSchema.safeParse({ arbitraryChannel: true }).success).toBe(false)
  })
})
