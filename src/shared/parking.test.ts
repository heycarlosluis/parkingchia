import { describe, expect, it } from 'vitest'
import { calculateChange, closeSessionSchema, describeElapsed } from './parking'

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

describe('describeElapsed', () => {
  it('muestra solo minutos cuando no llegan a una hora', () => {
    expect(describeElapsed(0)).toBe('0 min')
    expect(describeElapsed(45)).toBe('45 min')
  })

  it('muestra horas y minutos completos', () => {
    expect(describeElapsed(60)).toBe('1 h')
    expect(describeElapsed(90)).toBe('1 h 30 min')
  })

  it('conserva los minutos al pasar de un día', () => {
    expect(describeElapsed(1440)).toBe('1 d')
    expect(describeElapsed(1500)).toBe('1 d 1 h')
    expect(describeElapsed(1505)).toBe('1 d 1 h 5 min')
    expect(describeElapsed(2900)).toBe('2 d 20 min')
  })
})
