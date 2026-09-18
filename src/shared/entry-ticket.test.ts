import { describe, expect, it } from 'vitest'
import {
  decodeEntryTicketCode,
  encodeEntryTicketBarcode,
  encodeEntryTicketQr,
  encodeEntryTicketReference,
  formatEntryTicketReference,
  isEntryTicketCode,
  sanitizeExitCodeInput,
  type EntryTicketPayload,
} from './entry-ticket'

const payload: EntryTicketPayload = {
  version: 1,
  sessionId: '123e4567-e89b-12d3-a456-426614174000',
  plate: 'ABC123',
  vehicleType: 'car',
  ratePlanId: 'rate-car',
  ratePlanName: 'Automóvil por hora',
  ratePlanAmountCop: 5000,
  billingUnit: 'hour',
  enteredAt: '2026-09-15T12:34:00.000Z',
  graceMinutes: 15,
  employeeName: 'María José',
  notes: 'Llaves en recepción',
}

describe('código del tiquete de ingreso', () => {
  it('usa 16 dígitos con verificación Luhn y recupera el inicio del UUID', () => {
    const reference = encodeEntryTicketReference(payload.sessionId)
    expect(reference).toMatch(/^\d{16}$/)
    expect(decodeEntryTicketCode(reference)).toEqual({
      kind: 'reference',
      sessionIdPrefix: '123e4567-e89b',
    })
    // Así lo imprime el tiquete y así puede teclearlo el operador.
    expect(decodeEntryTicketCode(formatEntryTicketReference(reference))).toEqual(
      decodeEntryTicketCode(reference),
    )
    expect(formatEntryTicketReference('1234567890123456')).toBe('1234 5678 9012 3456')
  })

  it('rechaza un dígito cambiado o dos dígitos invertidos', () => {
    const reference = encodeEntryTicketReference(payload.sessionId)
    const changed = `${reference.slice(0, 5)}${(Number(reference[5]) + 1) % 10}${reference.slice(6)}`
    const swapped = `${reference.slice(0, 3)}${reference[4]}${reference[3]}${reference.slice(5)}`
    expect(decodeEntryTicketCode(changed)).toBeNull()
    if (swapped !== reference) expect(decodeEntryTicketCode(swapped)).toBeNull()
    // Aun dañado tiene forma de tiquete: se pide escanear de nuevo.
    expect(isEntryTicketCode(changed)).toBe(true)
  })

  it('no confunde el código con una matrícula', () => {
    expect(isEntryTicketCode('ABC123')).toBe(false)
    expect(isEntryTicketCode('12345678')).toBe(false)
  })
})

describe('códigos antiguos del tiquete de ingreso', () => {
  it('conserva todos los datos del ingreso dentro del QR', () => {
    const code = encodeEntryTicketQr(payload)
    expect(code).toMatch(/^PC1Q[A-Za-z0-9_-]+$/)
    expect(decodeEntryTicketCode(code)).toEqual({
      kind: 'qr',
      sessionId: payload.sessionId,
      payload,
    })
  })

  it('crea un Code 128 corto que recupera el identificador de sesión', () => {
    const code = encodeEntryTicketBarcode(payload.sessionId)
    expect(code).toMatch(/^PC1S\d{39}$/)
    expect(decodeEntryTicketCode(code)).toEqual({
      kind: 'barcode',
      sessionId: payload.sessionId,
    })
  })

  it('lee un QR antiguo escaneado con teclado latinoamericano o bloqueo de mayúsculas', () => {
    // Nota con eñe y tildes para forzar «-» y «_» en el base64url.
    const code = encodeEntryTicketQr({ ...payload, notes: 'Ñandú ¿llegó? — «sí» ~~~ ÿÿÿ' })
    const latinAmerican = code.replaceAll('-', "'").replaceAll('_', '?')
    const capsLock = `PC1Q${code
      .slice(4)
      .replace(/[a-z]/gi, (letter) =>
        letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase(),
      )}`
    expect(code).toMatch(/[-_]/)
    expect(decodeEntryTicketCode(latinAmerican)).toMatchObject({ kind: 'qr' })
    expect(decodeEntryTicketCode(capsLock)).toMatchObject({ kind: 'qr' })
  })

  it('lee un Code 128 antiguo con el prefijo en minúsculas', () => {
    const code = encodeEntryTicketBarcode(payload.sessionId)
    expect(decodeEntryTicketCode(code.toLowerCase())).toEqual({
      kind: 'barcode',
      sessionId: payload.sessionId,
    })
  })

  it('rechaza códigos propios dañados', () => {
    expect(decodeEntryTicketCode('PC1Qcontenido-invalido')).toBeNull()
    expect(decodeEntryTicketCode('PC1S1234')).toBeNull()
    expect(decodeEntryTicketCode(`PC1S${'9'.repeat(39)}`)).toBeNull()
  })
})

describe('campo de Registrar salida', () => {
  it('filtra una matrícula como el campo de ingreso', () => {
    expect(sanitizeExitCodeInput('abc-12ñ')).toBe('ABC12N')
    expect(sanitizeExitCodeInput('abcd123456')).toBe('ABCD1234')
  })

  it('deja crecer una cadena de dígitos hasta el código del tiquete', () => {
    expect(sanitizeExitCodeInput('123456789')).toBe('123456789')
    expect(sanitizeExitCodeInput('1234 5678 9012 3456 7')).toBe('1234567890123456')
  })

  it('conserva intactos los códigos del tiquete', () => {
    const qr = encodeEntryTicketQr(payload)
    expect(sanitizeExitCodeInput(qr)).toBe(qr)
    // El prefijo sobrevive al filtro mientras el lector lo escribe.
    expect(sanitizeExitCodeInput('PC1')).toBe('PC1')
    expect(sanitizeExitCodeInput('PC1Q.a-b_c')).toBe('PC1Q.a-b_c')
  })
})
