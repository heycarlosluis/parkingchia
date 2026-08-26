import { describe, expect, it } from 'vitest'
import { elapsedMinutes, elapsedMinutesOrZero, formatCurrency } from './format'

describe('helpers de formato y duración', () => {
  it('formatea pesos colombianos sin decimales', () => {
    expect(formatCurrency(12500)).toMatch(/12[.]500/)
    expect(formatCurrency(12500)).toContain('$')
  })

  it('cuenta minutos cumplidos y no minutos iniciados', () => {
    expect(elapsedMinutes('2026-08-18T12:00:00.000Z', '2026-08-18T12:01:01.000Z')).toBe(1)
    expect(elapsedMinutes('2026-08-18T12:00:00.000Z', '2026-08-18T13:05:59.000Z')).toBe(65)
    expect(elapsedMinutes('2026-08-18T12:00:00.000Z', '2026-08-18T13:06:00.000Z')).toBe(66)
  })

  it('devuelve cero en lugar de fallar cuando el intervalo queda invertido', () => {
    expect(() => elapsedMinutes('2026-08-18T13:00:00.000Z', '2026-08-18T12:00:00.000Z')).toThrow(
      RangeError,
    )
    expect(elapsedMinutesOrZero('2026-08-18T13:00:00.000Z', '2026-08-18T12:00:00.000Z')).toBe(0)
    expect(elapsedMinutesOrZero('2026-08-18T12:00:00.000Z', '2026-08-18T13:00:00.000Z')).toBe(60)
  })
})
