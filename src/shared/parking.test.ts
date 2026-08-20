import { describe, expect, it } from 'vitest'
import { calculateChange, closeSessionSchema } from './parking'

describe('esquema de cierre de salida', () => {
  const base = {
    sessionId: 'session-1',
    expectedTotalCop: 10_000,
    method: 'cash' as const,
    receivedCop: 20_000,
    notes: null,
  }

  it('exige el efectivo recibido cuando se cobra en efectivo', () => {
    expect(closeSessionSchema.safeParse(base).success).toBe(true)
    expect(closeSessionSchema.safeParse({ ...base, receivedCop: null }).success).toBe(false)
    expect(closeSessionSchema.safeParse({ ...base, receivedCop: 5000 }).success).toBe(false)
  })

  it('no exige efectivo para otros medios ni para salidas sin cobro', () => {
    expect(
      closeSessionSchema.safeParse({ ...base, method: 'card', receivedCop: null }).success,
    ).toBe(true)
    expect(
      closeSessionSchema.safeParse({ ...base, expectedTotalCop: 0, receivedCop: null }).success,
    ).toBe(true)
  })

  it('calcula el cambio solo cuando hay efectivo recibido', () => {
    expect(calculateChange(10_000, 20_000)).toBe(10_000)
    expect(calculateChange(10_000, null)).toBeNull()
  })
})
