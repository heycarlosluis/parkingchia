import { describe, expect, it } from 'vitest'
import { calculateNitCheckDigit, describeNitError, formatNit, parseNit } from './nit'

describe('NIT colombiano', () => {
  it('calcula el dígito de verificación de NIT reales', () => {
    // DIAN, SENA y Davivienda.
    expect(calculateNitCheckDigit('800197268')).toBe(4)
    expect(calculateNitCheckDigit('899999034')).toBe(1)
    expect(calculateNitCheckDigit('860034313')).toBe(7)
  })

  it('acepta personas jurídicas y naturales con separadores habituales', () => {
    expect(parseNit('800.197.268-4')).toEqual({ ok: true, base: '800197268', checkDigit: 4 })
    expect(parseNit(' 899 999 034 - 1 ')).toEqual({ ok: true, base: '899999034', checkDigit: 1 })
    // Persona natural: la cédula de 10 dígitos es la base del NIT.
    expect(parseNit('1.020.304.050-8')).toEqual({ ok: true, base: '1020304050', checkDigit: 8 })
  })

  it('rechaza un dígito de verificación que no corresponde', () => {
    const parsed = parseNit('800.197.268-5')
    expect(parsed).toMatchObject({ ok: false, reason: 'check-digit' })
  })

  it('sugiere el dígito de verificación cuando falta', () => {
    const parsed = parseNit('800197268')
    expect(parsed).toMatchObject({ ok: false, reason: 'missing-check-digit' })
    if (parsed.ok) throw new Error('Se esperaba un NIT incompleto')
    expect(describeNitError(parsed)).toContain('800.197.268-4')
  })

  it('rechaza letras y largos fuera de rango', () => {
    expect(parseNit('NIT 800197268-4')).toMatchObject({ ok: false, reason: 'format' })
    expect(parseNit('12-1')).toMatchObject({ ok: false, reason: 'length' })
    expect(parseNit('12345678901-1')).toMatchObject({ ok: false, reason: 'length' })
  })

  it('agrupa los miles al mostrarlo', () => {
    expect(formatNit('800197268-4')).toBe('800.197.268-4')
    expect(formatNit('1020304050-8')).toBe('1.020.304.050-8')
  })
})
