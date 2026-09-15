import { z } from 'zod'
import { ratePlanIdSchema, tariffBillingUnitSchema, vehicleTypeSchema } from './tariff'
import { plateSchema } from './validation'

/** Versión del contenido inmutable que se guarda al registrar un ingreso. */
export const ENTRY_TICKET_VERSION = 1

/**
 * Prefijos propios de Parking Chía.
 *
 * Solo usan caracteres alfanuméricos para evitar diferencias entre teclados
 * configurados en español o inglés cuando el lector funciona como USB HID.
 */
export const ENTRY_TICKET_QR_PREFIX = 'PC1Q'
export const ENTRY_TICKET_BARCODE_PREFIX = 'PC1S'

export const MAX_ENTRY_SCAN_LENGTH = 4096

export const entryTicketPayloadSchema = z
  .object({
    version: z.literal(ENTRY_TICKET_VERSION),
    sessionId: z.string().trim().min(1).max(64),
    plate: plateSchema,
    vehicleType: vehicleTypeSchema,
    ratePlanId: ratePlanIdSchema,
    ratePlanName: z.string().trim().min(1).max(100),
    ratePlanAmountCop: z.number().int().min(0),
    billingUnit: tariffBillingUnitSchema,
    enteredAt: z.string().datetime(),
    graceMinutes: z.number().int().min(0),
    employeeName: z.string().trim().min(1).max(100).nullable(),
    notes: z.string().trim().max(200).nullable(),
  })
  .strict()

export type EntryTicketPayload = z.infer<typeof entryTicketPayloadSchema>

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

/** QR autocontenido con todos los datos que existían al momento del ingreso. */
export function encodeEntryTicketQr(payload: EntryTicketPayload): string {
  return `${ENTRY_TICKET_QR_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`
}

/** Code 128 corto para lectores que solo admiten códigos lineales. */
export function encodeEntryTicketBarcode(sessionId: string): string {
  const hexadecimal = sessionId.replaceAll('-', '')
  if (!/^[A-F0-9]{32}$/i.test(hexadecimal)) throw new Error('La sesión no tiene un UUID válido')
  // En Code 128, una cadena numérica se compacta en pares. El UUID decimal
  // ocupa menos módulos que sus 32 dígitos hexadecimales y cabe mejor en 58 mm.
  const decimal = BigInt(`0x${hexadecimal}`).toString(10).padStart(39, '0')
  return `${ENTRY_TICKET_BARCODE_PREFIX}${decimal}`
}

export type DecodedEntryTicket =
  | { kind: 'qr'; sessionId: string; payload: EntryTicketPayload }
  | { kind: 'barcode'; sessionId: string }

/**
 * Decodifica únicamente códigos emitidos por Parking Chía.
 *
 * El contenido sirve para localizar y cotejar la sesión; los valores del
 * cobro siempre se vuelven a consultar en la base local.
 */
export function decodeEntryTicketCode(value: string): DecodedEntryTicket | null {
  const code = value.trim()
  if (code.startsWith(ENTRY_TICKET_QR_PREFIX)) {
    try {
      const json = decodeBase64Url(code.slice(ENTRY_TICKET_QR_PREFIX.length))
      const payload = entryTicketPayloadSchema.parse(JSON.parse(json) as unknown)
      return { kind: 'qr', sessionId: payload.sessionId, payload }
    } catch {
      return null
    }
  }

  if (code.startsWith(ENTRY_TICKET_BARCODE_PREFIX)) {
    const decimalId = code.slice(ENTRY_TICKET_BARCODE_PREFIX.length)
    if (!/^\d{39}$/.test(decimalId)) return null
    let compactId: string
    try {
      compactId = BigInt(decimalId).toString(16).padStart(32, '0')
    } catch {
      return null
    }
    if (compactId.length !== 32) return null
    const sessionId = [
      compactId.slice(0, 8),
      compactId.slice(8, 12),
      compactId.slice(12, 16),
      compactId.slice(16, 20),
      compactId.slice(20),
    ].join('-')
    return { kind: 'barcode', sessionId: sessionId.toLowerCase() }
  }

  return null
}

export function isEntryTicketCode(value: string): boolean {
  const code = value.trim().toUpperCase()
  return code.startsWith(ENTRY_TICKET_QR_PREFIX) || code.startsWith(ENTRY_TICKET_BARCODE_PREFIX)
}
