import { z } from 'zod'
import { ratePlanIdSchema, tariffBillingUnitSchema, vehicleTypeSchema } from './tariff'
import { plateSchema, sanitizePlateInput } from './validation'

/** Versión del contenido inmutable que se guarda al registrar un ingreso. */
export const ENTRY_TICKET_VERSION = 1

/**
 * Prefijos de los códigos que se imprimieron hasta `0.1.0-alpha.5`.
 *
 * El QR `PC1Q` llevaba el snapshot en base64url y el Code 128 `PC1S` el UUID
 * en decimal. Se siguen leyendo para no dejar sin salida los tiquetes que ya
 * están en manos de los clientes, pero ya no se imprimen (D-038).
 */
export const ENTRY_TICKET_QR_PREFIX = 'PC1Q'
export const ENTRY_TICKET_BARCODE_PREFIX = 'PC1S'

/**
 * Código del tiquete: 15 dígitos de la sesión y uno de verificación Luhn.
 *
 * Solo dígitos porque el lector funciona como un teclado estadounidense: en
 * una distribución latinoamericana o española los signos y las mayúsculas
 * pueden llegar cambiados, mientras que la fila de números es idéntica. Una
 * cadena de 16 dígitos tampoco puede confundirse con una matrícula (máximo 8
 * caracteres), así que no necesita prefijo. Los 15 dígitos codifican los
 * primeros 48 bits del UUID de la sesión, que bastan para distinguirla entre
 * los ingresos activos de un parqueadero.
 */
export const ENTRY_TICKET_REFERENCE_LENGTH = 16
const REFERENCE_BODY_LENGTH = ENTRY_TICKET_REFERENCE_LENGTH - 1
const REFERENCE_HEX_LENGTH = 12
const REFERENCE_PATTERN = /^\d{16}$/

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

/** QR con el snapshot completo, tal como se imprimía hasta `0.1.0-alpha.5`. */
export function encodeEntryTicketQr(payload: EntryTicketPayload): string {
  return `${ENTRY_TICKET_QR_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`
}

/** Code 128 con el UUID en decimal, tal como se imprimía hasta `0.1.0-alpha.5`. */
export function encodeEntryTicketBarcode(sessionId: string): string {
  const hexadecimal = sessionId.replaceAll('-', '')
  if (!/^[A-F0-9]{32}$/i.test(hexadecimal)) throw new Error('La sesión no tiene un UUID válido')
  const decimal = BigInt(`0x${hexadecimal}`).toString(10).padStart(39, '0')
  return `${ENTRY_TICKET_BARCODE_PREFIX}${decimal}`
}

/** Dígito de verificación Luhn: detecta un dígito cambiado y casi toda transposición. */
function luhnCheckDigit(digits: string): number {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return (10 - (sum % 10)) % 10
}

/** Código que imprimen el QR y el Code 128 del tiquete, y que el operador puede teclear. */
export function encodeEntryTicketReference(sessionId: string): string {
  const hexadecimal = sessionId.replaceAll('-', '')
  if (!/^[A-F0-9]{32}$/i.test(hexadecimal)) throw new Error('La sesión no tiene un UUID válido')
  const body = BigInt(`0x${hexadecimal.slice(0, REFERENCE_HEX_LENGTH)}`)
    .toString(10)
    .padStart(REFERENCE_BODY_LENGTH, '0')
  return `${body}${luhnCheckDigit(body)}`
}

/** Agrupa el código de cuatro en cuatro para leerlo y teclearlo sin perderse. */
export function formatEntryTicketReference(reference: string): string {
  return reference.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export type DecodedEntryTicket =
  | { kind: 'reference'; sessionIdPrefix: string }
  | { kind: 'qr'; sessionId: string; payload: EntryTicketPayload }
  | { kind: 'barcode'; sessionId: string }

function decodeReference(code: string): DecodedEntryTicket | null {
  if (!REFERENCE_PATTERN.test(code)) return null
  const body = code.slice(0, REFERENCE_BODY_LENGTH)
  if (luhnCheckDigit(body) !== Number(code.slice(REFERENCE_BODY_LENGTH))) return null
  const hexadecimal = BigInt(body).toString(16)
  if (hexadecimal.length > REFERENCE_HEX_LENGTH) return null
  const prefix = hexadecimal.padStart(REFERENCE_HEX_LENGTH, '0')
  return { kind: 'reference', sessionIdPrefix: `${prefix.slice(0, 8)}-${prefix.slice(8)}` }
}

/**
 * Deshace lo que un teclado latinoamericano o español le hace a un QR antiguo.
 *
 * El lector envía las teclas de un teclado estadounidense: la tecla del `-`
 * escribe `'` y con mayúsculas escribe `?`, que nunca aparecen en base64url.
 */
function repairLayout(value: string): string {
  return value.replaceAll("'", '-').replaceAll('?', '_')
}

/** Con el bloqueo de mayúsculas activo, el lector invierte cada letra. */
function swapCase(value: string): string {
  return value.replace(/[a-z]/gi, (letter) =>
    letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase(),
  )
}

function decodeLegacyQr(payloadText: string): DecodedEntryTicket | null {
  const repaired = repairLayout(payloadText)
  for (const candidate of [payloadText, repaired, swapCase(payloadText), swapCase(repaired)]) {
    try {
      const json = decodeBase64Url(candidate)
      const payload = entryTicketPayloadSchema.parse(JSON.parse(json) as unknown)
      return { kind: 'qr', sessionId: payload.sessionId, payload }
    } catch {
      // Se prueba la siguiente interpretación del teclado.
    }
  }
  return null
}

function decodeLegacyBarcode(decimalId: string): DecodedEntryTicket | null {
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

/**
 * Decodifica únicamente códigos emitidos por Parking Chía.
 *
 * El contenido sirve para localizar la sesión; los valores del cobro siempre
 * se vuelven a consultar en la base local.
 */
export function decodeEntryTicketCode(value: string): DecodedEntryTicket | null {
  const code = value.trim()
  const reference = decodeReference(code.replace(/\s/g, ''))
  if (reference) return reference

  const prefix = code.slice(0, ENTRY_TICKET_QR_PREFIX.length).toUpperCase()
  const rest = code.slice(ENTRY_TICKET_QR_PREFIX.length)
  if (prefix === ENTRY_TICKET_QR_PREFIX) return decodeLegacyQr(rest)
  if (prefix === ENTRY_TICKET_BARCODE_PREFIX) return decodeLegacyBarcode(rest)
  return null
}

function hasLegacyPrefix(value: string): boolean {
  const code = value.trim().toUpperCase()
  return code.startsWith(ENTRY_TICKET_QR_PREFIX) || code.startsWith(ENTRY_TICKET_BARCODE_PREFIX)
}

/**
 * Indica si el valor tiene forma de tiquete, aunque llegue dañado.
 *
 * Sirve para responder «vuelve a escanear» en lugar de «matrícula inválida»
 * cuando el lector leyó a medias.
 */
export function isEntryTicketCode(value: string): boolean {
  return hasLegacyPrefix(value) || REFERENCE_PATTERN.test(value.replace(/\s/g, ''))
}

/**
 * Valor del campo de Registrar salida mientras se escribe.
 *
 * Una matrícula se filtra igual que en Registrar ingreso. Una cadena solo de
 * dígitos se deja crecer hasta el largo del código del tiquete, y un código
 * antiguo con prefijo se conserva intacto porque su QR distingue mayúsculas.
 */
export function sanitizeExitCodeInput(value: string): string {
  if (hasLegacyPrefix(value)) return value.slice(0, MAX_ENTRY_SCAN_LENGTH)
  const compact = value.replace(/\s/g, '')
  if (/^\d+$/.test(compact)) return compact.slice(0, ENTRY_TICKET_REFERENCE_LENGTH)
  return sanitizePlateInput(value)
}
