/**
 * NIT colombiano.
 *
 * La DIAN asigna el mismo formato a todos los contribuyentes: un número base y
 * un dígito de verificación (DV) calculado con módulo 11. Cambia solo el largo
 * del número base:
 *
 * - Persona jurídica: 9 dígitos, normalmente empieza por 8 o 9 (900.123.456-8).
 * - Persona natural: su número de cédula, de 3 a 10 dígitos (1.020.304.050-8).
 * - Extranjeros y demás inscritos en el RUT: número asignado por la DIAN.
 *
 * Por eso se valida el DV en lugar de exigir un largo por tipo de persona: un
 * dígito mal escrito cambia el DV y se detecta en cualquiera de los casos.
 */

export const MIN_NIT_BASE_LENGTH = 3
export const MAX_NIT_BASE_LENGTH = 10

/** Pesos oficiales de la DIAN, del dígito menos significativo al más significativo. */
const DIAN_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

export function calculateNitCheckDigit(base: string): number {
  const digits = base.split('').reverse()
  const sum = digits.reduce((total, digit, index) => {
    const weight = DIAN_WEIGHTS[index] ?? 0
    return total + Number(digit) * weight
  }, 0)
  const remainder = sum % 11
  return remainder > 1 ? 11 - remainder : remainder
}

export type ParsedNit =
  | { ok: true; base: string; checkDigit: number }
  | { ok: false; reason: 'format' | 'length' }
  | { ok: false; reason: 'missing-check-digit' | 'check-digit'; base: string }

/**
 * Interpreta un NIT tal como se escribe en el RUT o en una factura.
 *
 * Acepta puntos, espacios y comas como separadores de miles. El DV debe ir
 * tras un guion: sin él, un número de 10 dígitos sería ambiguo entre una
 * cédula completa y un NIT de 9 dígitos con su DV pegado.
 */
export function parseNit(value: string): ParsedNit {
  const compact = value.trim().replace(/[.,\s]/g, '')
  const match = /^(\d+)(?:-(\d))?$/.exec(compact)
  if (!match) return { ok: false, reason: 'format' }

  const base = (match[1] ?? '').replace(/^0+(?=\d)/, '')
  if (base.length < MIN_NIT_BASE_LENGTH || base.length > MAX_NIT_BASE_LENGTH) {
    return { ok: false, reason: 'length' }
  }
  if (match[2] === undefined) return { ok: false, reason: 'missing-check-digit', base }

  const checkDigit = Number(match[2])
  if (checkDigit !== calculateNitCheckDigit(base)) {
    return { ok: false, reason: 'check-digit', base }
  }
  return { ok: true, base, checkDigit }
}

/** Forma en que se persiste: dígitos y DV, sin separadores de miles. */
export function normalizeNit(base: string, checkDigit: number): string {
  return `${base}-${checkDigit}`
}

/** Forma legible para pantalla y papel: `900.123.456-8`. */
export function formatNit(value: string): string {
  const parsed = parseNit(value)
  if (!parsed.ok) return value
  const grouped = parsed.base.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grouped}-${parsed.checkDigit}`
}

export function describeNitError(parsed: Exclude<ParsedNit, { ok: true }>): string {
  switch (parsed.reason) {
    case 'format':
      return 'Usa solo números y el guion antes del dígito de verificación, por ejemplo 900.123.456-8'
    case 'length':
      return `El NIT debe tener entre ${MIN_NIT_BASE_LENGTH} y ${MAX_NIT_BASE_LENGTH} dígitos antes del guion`
    case 'missing-check-digit':
      return `Agrega el dígito de verificación tras un guion: ${formatNit(normalizeNit(parsed.base, calculateNitCheckDigit(parsed.base)))}`
    case 'check-digit':
      return 'El dígito de verificación no corresponde a este número. Revísalo en el RUT'
  }
}
