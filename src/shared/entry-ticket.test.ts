import { describe, expect, it } from 'vitest'
import {
  decodeEntryTicketCode,
  encodeEntryTicketBarcode,
  encodeEntryTicketQr,
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

describe('códigos del tiquete de ingreso', () => {
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

  it('rechaza códigos propios dañados', () => {
    expect(decodeEntryTicketCode('PC1Qcontenido-invalido')).toBeNull()
    expect(decodeEntryTicketCode('PC1S1234')).toBeNull()
    expect(decodeEntryTicketCode(`PC1S${'9'.repeat(39)}`)).toBeNull()
  })
})
