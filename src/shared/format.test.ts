import { describe, expect, it } from 'vitest'
import { durationMinutes, formatCurrency } from './format'

describe('helpers de formato y duración', () => {
  it('formatea pesos colombianos sin decimales', () => {
    expect(formatCurrency(12500)).toMatch(/12[.]500/)
    expect(formatCurrency(12500)).toContain('$')
  })

  it('redondea una duración iniciada al minuto siguiente', () => {
    expect(durationMinutes('2026-08-18T12:00:00.000Z', '2026-08-18T12:01:01.000Z')).toBe(2)
  })
})
