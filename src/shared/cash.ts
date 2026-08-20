import { z } from 'zod'
import { MAX_AMOUNT_COP } from './tariff'

/**
 * Dominio de Caja de Parking Chía.
 *
 * La caja es una sesión de turno con fondo inicial y cierre explícito. Cada pago
 * de parqueo o de mensualidad queda asociado a la caja abierta al momento de
 * registrarlo, y un cobro ya emitido puede anularse con motivo mientras la caja
 * que lo contiene siga abierta. Aquí viven únicamente los contratos de entrada;
 * el arqueo y la persistencia viven en el proceso principal.
 */

export type CashSessionStatus = 'open' | 'closed'

export const CASH_SESSION_STATUS_LABELS: Record<CashSessionStatus, string> = {
  open: 'Abierta',
  closed: 'Cerrada',
}

export type CashPaymentStatus = 'completed' | 'voided' | 'refunded'

export const CASH_PAYMENT_STATUS_LABELS: Record<CashPaymentStatus, string> = {
  completed: 'Registrado',
  voided: 'Anulado',
  refunded: 'Devuelto',
}

export type CashMovementSource = 'parking' | 'monthly'

export const CASH_MOVEMENT_SOURCE_LABELS: Record<CashMovementSource, string> = {
  parking: 'Parqueo',
  monthly: 'Mensualidad',
}

const copAmount = (label: string) =>
  z
    .number()
    .int(`${label} debe ser un valor entero en pesos`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_AMOUNT_COP, `${label} supera el máximo permitido`)

const optionalNotes = z
  .string()
  .trim()
  .max(200, 'La nota es demasiado larga')
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))

export const paymentIdSchema = z.string().trim().min(1).max(64)

export const openCashSessionSchema = z
  .object({
    /** Empleado que opera este turno de caja. */
    employeeId: z.string().trim().min(1, 'Selecciona el empleado que abre la caja'),
    /** Dinero con el que inicia el turno, en pesos colombianos enteros. */
    openingAmountCop: copAmount('El fondo inicial'),
    notes: optionalNotes,
  })
  .strict()

export const closeCashSessionSchema = z
  .object({
    /** Efectivo que el operador contó al cerrar, en pesos colombianos enteros. */
    closingAmountCop: copAmount('El efectivo contado'),
    notes: optionalNotes,
  })
  .strict()

export const voidPaymentSchema = z
  .object({
    paymentId: paymentIdSchema,
    reason: z
      .string()
      .trim()
      .min(4, 'Explica por qué se anula el cobro')
      .max(200, 'El motivo es demasiado largo'),
  })
  .strict()

export const cashSessionReceiptSchema = z
  .object({ sessionId: z.string().trim().min(1).max(64) })
  .strict()

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>
