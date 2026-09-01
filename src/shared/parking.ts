import { z } from 'zod'
import { plateSchema } from './validation'
import { MAX_AMOUNT_COP, ratePlanIdSchema, vehicleTypeSchema } from './tariff'

/**
 * Contratos de entrada del módulo de parqueo.
 *
 * El cálculo del cobro vive en `./tariff`; aquí solo se validan las órdenes
 * que el operador envía al proceso principal.
 */

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}

export const sessionIdSchema = z.string().trim().min(1).max(64)

const optionalNotes = z
  .string()
  .trim()
  .max(200, 'La nota es demasiado larga')
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))

export const registerEntrySchema = z
  .object({
    plate: plateSchema,
    vehicleType: vehicleTypeSchema,
    ratePlanId: ratePlanIdSchema,
    notes: optionalNotes,
  })
  .strict()

export const listActiveSessionsSchema = z.object({ search: z.string().trim().max(20) }).strict()

export const quoteSessionSchema = z.object({ sessionId: sessionIdSchema }).strict()

export const closeSessionSchema = z
  .object({
    sessionId: sessionIdSchema,
    /** Total mostrado al operador; protege contra cobrar un valor distinto al confirmado. */
    expectedTotalCop: z
      .number()
      .int('El total debe ser un valor entero en pesos')
      .min(0, 'El total no puede ser negativo')
      .max(MAX_AMOUNT_COP, 'El total supera el máximo permitido'),
    method: z.enum(PAYMENT_METHODS),
    receivedCop: z
      .number()
      .int('El efectivo recibido debe ser un valor entero en pesos')
      .min(0, 'El efectivo recibido no puede ser negativo')
      .max(MAX_AMOUNT_COP, 'El efectivo recibido supera el máximo permitido')
      .nullable(),
    notes: optionalNotes,
  })
  .strict()
  .refine(
    (value) =>
      value.method !== 'cash' ||
      value.expectedTotalCop === 0 ||
      (value.receivedCop !== null && value.receivedCop >= value.expectedTotalCop),
    {
      message: 'Registra el efectivo recibido y que cubra el total a cobrar.',
      path: ['receivedCop'],
    },
  )

export const MAX_HISTORY_PAGE_SIZE = 100

/** Cómo terminó una salida, ya resuelto para presentarlo en una sola columna. */
export type ExitStatus = 'charged' | 'monthly' | 'free' | 'cancelled'

export const EXIT_STATUS_LABELS: Record<ExitStatus, string> = {
  charged: 'Cobrada',
  monthly: 'Mensualidad',
  free: 'Sin cobro',
  cancelled: 'Anulada',
}

/**
 * Estado de una salida a partir de lo que quedó registrado.
 *
 * El orden importa: un ingreso anulado nunca llegó a cobrarse, y una sesión
 * cubierta por una mensualidad cierra sin recibo igual que una dentro de la
 * tolerancia, así que la cobertura se comprueba antes que la ausencia de
 * recibo. Recibe la forma mínima y no el registro completo para no depender
 * de `contracts`, que a su vez depende de este archivo.
 */
export function exitStatusOf(record: {
  status: 'closed' | 'cancelled'
  monthlyCustomerName: string | null
  receiptNumber: number | null
}): ExitStatus {
  if (record.status === 'cancelled') return 'cancelled'
  if (record.monthlyCustomerName !== null) return 'monthly'
  return record.receiptNumber === null ? 'free' : 'charged'
}

export const listExitsSchema = z
  .object({
    search: z.string().trim().max(20),
    /** Fecha local `AAAA-MM-DD`; vacío no filtra. */
    from: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida')]),
    to: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida')]),
    limit: z.number().int().min(1).max(MAX_HISTORY_PAGE_SIZE),
  })
  .strict()
  .refine((value) => value.from === '' || value.to === '' || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['from'],
  })

export const cancelSessionSchema = z
  .object({
    sessionId: sessionIdSchema,
    reason: z
      .string()
      .trim()
      .min(4, 'Explica por qué se anula la sesión')
      .max(200, 'El motivo es demasiado largo'),
  })
  .strict()

export type RegisterEntryInput = z.infer<typeof registerEntrySchema>
export type ListActiveSessionsInput = z.infer<typeof listActiveSessionsSchema>
export type QuoteSessionInput = z.infer<typeof quoteSessionSchema>
export type CloseSessionInput = z.infer<typeof closeSessionSchema>
export type CancelSessionInput = z.infer<typeof cancelSessionSchema>
export type ListExitsInput = z.infer<typeof listExitsSchema>

/** Vuelto a entregar, o `null` cuando el pago no es en efectivo o no se registró el recibido. */
export function calculateChange(totalCop: number, receivedCop: number | null): number | null {
  if (receivedCop === null) return null
  return receivedCop - totalCop
}

/** Texto corto y legible para una permanencia expresada en minutos. */
export function describeElapsed(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} d`)
  if (hours > 0) parts.push(`${hours} h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} min`)
  return parts.join(' ')
}
