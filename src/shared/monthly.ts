import { z } from 'zod'
import { PAYMENT_METHODS } from './parking'
import { MAX_AMOUNT_COP, ratePlanIdSchema, vehicleTypeSchema } from './tariff'
import { plateSchema } from './validation'

/**
 * Dominio de mensualidades de Parking Chía.
 *
 * Una mensualidad es un periodo pagado por adelantado durante el cual el
 * vehículo de un cliente entra y sale sin cobro por horas. El módulo no conoce
 * SQLite ni React: aquí viven las fechas, los estados y la validación.
 *
 * Las fechas que elige el operador son fechas locales `AAAA-MM-DD` y describen
 * días completos. Se persisten como instantes UTC: `startsAt` es el comienzo
 * del primer día cubierto y `endsAt` el comienzo del día siguiente al último,
 * de modo que la cobertura es el intervalo semiabierto `[startsAt, endsAt)`.
 */

export const MONTHLY_BILLING_UNIT = 'month'

/** Meses que admite una mensualidad nueva o una renovación. */
export const MIN_SUBSCRIPTION_MONTHS = 1
export const MAX_SUBSCRIPTION_MONTHS = 12

/** Días de anticipación con los que una mensualidad se considera por vencer. */
export const EXPIRING_SOON_DAYS = 7

export const MILLISECONDS_PER_DAY = 86_400_000

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled'
export type SubscriptionPaymentState = 'unpaid' | 'partial' | 'paid'
export type MonthlyCustomerStatus = 'active' | 'inactive'

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'expired', 'cancelled'] as const

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: 'Por iniciar',
  active: 'Vigente',
  expired: 'Vencida',
  cancelled: 'Cancelada',
}

export const PAYMENT_STATE_LABELS: Record<SubscriptionPaymentState, string> = {
  unpaid: 'Sin pagar',
  partial: 'Abono parcial',
  paid: 'Pagada',
}

export const CUSTOMER_STATUS_LABELS: Record<MonthlyCustomerStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseLocalDate(localDate: string): { year: number; month: number; day: number } {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new RangeError('La fecha debe tener el formato AAAA-MM-DD')
  }
  const [year, month, day] = localDate.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

function toLocalDateText(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Verdadero cuando la fecha existe en el calendario; descarta 2026-02-31. */
export function isRealLocalDate(localDate: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(localDate)) return false
  const { year, month, day } = parseLocalDate(localDate)
  if (month < 1 || month > 12 || day < 1) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** Instante UTC en que comienza una fecha local, opcionalmente desplazada en días. */
export function startOfLocalDayUtc(localDate: string, addDays = 0): string {
  const { year, month, day } = parseLocalDate(localDate)
  return new Date(year, month - 1, day + addDays).toISOString()
}

/** Fecha local `AAAA-MM-DD` que corresponde a un instante UTC. */
export function toLocalDate(isoUtc: string): string {
  const date = new Date(isoUtc)
  if (Number.isNaN(date.getTime())) throw new RangeError('La marca de tiempo no es válida')
  return toLocalDateText(date)
}

/** Fecha local de hoy, la que el operador ve en el calendario. */
export function todayLocalDate(nowUtc: string = new Date().toISOString()): string {
  return toLocalDate(nowUtc)
}

/** Desplaza una fecha local en días conservando el calendario local. */
export function shiftLocalDate(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate)
  return toLocalDateText(new Date(year, month - 1, day + days))
}

/**
 * Suma meses a una fecha local recortando al último día real del mes destino.
 *
 * El 31 de enero más un mes es el 28 o el 29 de febrero, no el 3 de marzo.
 */
export function addMonthsToLocalDate(localDate: string, months: number): string {
  const { year, month, day } = parseLocalDate(localDate)
  const target = new Date(year, month - 1 + months, 1)
  const lastDayOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return toLocalDateText(
    new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDayOfTarget)),
  )
}

/**
 * Último día cubierto por una mensualidad de `months` meses que inicia en `startDate`.
 *
 * Un mes desde el 19 de agosto cubre hasta el 18 de septiembre inclusive.
 */
export function coverageEndDate(startDate: string, months: number): string {
  return shiftLocalDate(addMonthsToLocalDate(startDate, months), -1)
}

/** Último día cubierto que corresponde al límite exclusivo guardado en la base. */
export function lastCoveredLocalDate(endsAtUtc: string): string {
  const end = new Date(endsAtUtc)
  if (Number.isNaN(end.getTime())) throw new RangeError('La marca de tiempo no es válida')
  return toLocalDateText(new Date(end.getTime() - 1))
}

/** Días completos que cubre el periodo, contando el primero y el último. */
export function countCoveredDays(startsAtUtc: string, endsAtUtc: string): number {
  const start = Date.parse(startsAtUtc)
  const end = Date.parse(endsAtUtc)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / MILLISECONDS_PER_DAY)
}

/** La mensualidad cubre el instante indicado; el límite final es exclusivo. */
export function coversInstant(startsAtUtc: string, endsAtUtc: string, atUtc: string): boolean {
  const at = Date.parse(atUtc)
  return at >= Date.parse(startsAtUtc) && at < Date.parse(endsAtUtc)
}

/**
 * Estado vigente de una mensualidad.
 *
 * La cancelación es la única decisión del operador que se persiste tal cual;
 * el resto se deduce del calendario para que nunca quede desactualizado.
 */
export function deriveSubscriptionStatus(input: {
  startsAt: string
  endsAt: string
  cancelled: boolean
  nowUtc: string
}): SubscriptionStatus {
  if (input.cancelled) return 'cancelled'
  const now = Date.parse(input.nowUtc)
  if (now < Date.parse(input.startsAt)) return 'pending'
  if (now >= Date.parse(input.endsAt)) return 'expired'
  return 'active'
}

/**
 * Días que faltan para que venza la mensualidad.
 *
 * Cuenta días de cobertura restantes: el último día cubierto devuelve 1 y una
 * mensualidad vencida devuelve 0.
 */
export function daysUntilExpiry(endsAtUtc: string, nowUtc: string): number {
  const remaining = Date.parse(endsAtUtc) - Date.parse(nowUtc)
  if (!Number.isFinite(remaining) || remaining <= 0) return 0
  return Math.ceil(remaining / MILLISECONDS_PER_DAY)
}

export function isExpiringSoon(endsAtUtc: string, nowUtc: string): boolean {
  const remaining = daysUntilExpiry(endsAtUtc, nowUtc)
  return remaining > 0 && remaining <= EXPIRING_SOON_DAYS
}

/** Estado de pago comparando lo abonado contra el valor acordado. */
export function resolvePaymentState(amountCop: number, paidCop: number): SubscriptionPaymentState {
  if (paidCop <= 0) return amountCop === 0 ? 'paid' : 'unpaid'
  return paidCop >= amountCop ? 'paid' : 'partial'
}

/** Texto corto con la vigencia tal como la lee el operador. */
export function describeCoverage(startsAtUtc: string, endsAtUtc: string): string {
  const start = toLocalDate(startsAtUtc)
  const end = lastCoveredLocalDate(endsAtUtc)
  return `${formatLocalDate(start)} a ${formatLocalDate(end)}`
}

/** Fecha local en formato corto `DD/MM/AAAA`. */
export function formatLocalDate(localDate: string): string {
  const { year, month, day } = parseLocalDate(localDate)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/** Frase que explica cuánta vigencia queda, pensada para una fila de la tabla. */
export function describeRemaining(
  status: SubscriptionStatus,
  endsAtUtc: string,
  nowUtc: string,
): string {
  if (status === 'cancelled') return 'Cancelada'
  if (status === 'expired') return `Venció el ${formatLocalDate(lastCoveredLocalDate(endsAtUtc))}`
  if (status === 'pending') return 'Todavía no inicia'
  const remaining = daysUntilExpiry(endsAtUtc, nowUtc)
  if (remaining <= 1) return 'Vence hoy'
  return `${remaining} días restantes`
}

const localDateSchema = z
  .string()
  .trim()
  .regex(LOCAL_DATE_PATTERN, 'Usa una fecha con el formato AAAA-MM-DD')
  .refine(isRealLocalDate, 'Esa fecha no existe en el calendario')

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} es demasiado largo`)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))

const copAmount = (label: string) =>
  z
    .number()
    .int(`${label} debe ser un valor entero en pesos`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_AMOUNT_COP, `${label} supera el máximo permitido`)

export const monthlyCustomerIdSchema = z.string().trim().min(1).max(64)
export const subscriptionIdSchema = z.string().trim().min(1).max(64)

const monthlyCustomerShape = {
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre del cliente es obligatorio')
    .max(80, 'El nombre del cliente es demasiado largo'),
  documentNumber: optionalText(20, 'El documento'),
  phone: z
    .string()
    .trim()
    .max(25, 'El teléfono es demasiado largo')
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))
    .refine(
      (value) => value === null || /^[+\d()\-\s]{7,25}$/.test(value),
      'Usa un número de teléfono válido',
    ),
  email: z
    .string()
    .trim()
    .max(120, 'El correo es demasiado largo')
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))
    .refine(
      (value) => value === null || z.email().safeParse(value).success,
      'Usa un correo electrónico válido',
    ),
  notes: optionalText(200, 'La nota'),
  status: z.enum(['active', 'inactive']),
}

export const createMonthlyCustomerSchema = z.object(monthlyCustomerShape).strict()

export const updateMonthlyCustomerSchema = z
  .object({ id: monthlyCustomerIdSchema, ...monthlyCustomerShape })
  .strict()

export const deleteMonthlyCustomerSchema = z.object({ id: monthlyCustomerIdSchema }).strict()

const monthlyPlanShape = {
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del plan es obligatorio')
    .max(60, 'El nombre del plan es demasiado largo'),
  vehicleType: vehicleTypeSchema,
  amountCop: copAmount('El costo mensual'),
  status: z.enum(['active', 'inactive']),
}

export const createMonthlyPlanSchema = z.object(monthlyPlanShape).strict()

export const updateMonthlyPlanSchema = z
  .object({ id: ratePlanIdSchema, ...monthlyPlanShape })
  .strict()

export const deleteMonthlyPlanSchema = z.object({ id: ratePlanIdSchema }).strict()

export const createSubscriptionSchema = z
  .object({
    customerId: monthlyCustomerIdSchema,
    plate: plateSchema,
    vehicleType: vehicleTypeSchema,
    ratePlanId: ratePlanIdSchema,
    /** Primer día cubierto, en calendario local. */
    startDate: localDateSchema,
    /** Último día cubierto, en calendario local. */
    endDate: localDateSchema,
    amountCop: copAmount('El costo de la mensualidad'),
    notes: optionalText(200, 'La nota'),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: 'La fecha final no puede ser anterior a la inicial',
    path: ['endDate'],
  })

export const renewSubscriptionSchema = z
  .object({
    id: subscriptionIdSchema,
    months: z
      .number()
      .int('Los meses deben ser un número entero')
      .min(MIN_SUBSCRIPTION_MONTHS, 'Renueva por al menos un mes')
      .max(MAX_SUBSCRIPTION_MONTHS, `Renueva por máximo ${MAX_SUBSCRIPTION_MONTHS} meses`),
    /** `null` mantiene el costo del periodo anterior. */
    amountCop: copAmount('El costo de la mensualidad').nullable(),
  })
  .strict()

export const cancelSubscriptionSchema = z
  .object({
    id: subscriptionIdSchema,
    reason: z
      .string()
      .trim()
      .min(4, 'Explica por qué se cancela la mensualidad')
      .max(200, 'El motivo es demasiado largo'),
  })
  .strict()

export const registerSubscriptionPaymentSchema = z
  .object({
    subscriptionId: subscriptionIdSchema,
    amountCop: copAmount('El pago').refine((value) => value > 0, 'El pago debe ser mayor que cero'),
    method: z.enum(PAYMENT_METHODS),
    receivedCop: copAmount('El efectivo recibido').nullable(),
    reference: optionalText(60, 'La referencia'),
  })
  .strict()
  .refine(
    (value) =>
      value.method !== 'cash' ||
      (value.receivedCop !== null && value.receivedCop >= value.amountCop),
    {
      message: 'Registra el efectivo recibido y que cubra el pago.',
      path: ['receivedCop'],
    },
  )

export const listMonthlySchema = z
  .object({
    search: z.string().trim().max(40),
    status: z.enum(['all', ...SUBSCRIPTION_STATUSES]),
  })
  .strict()

export const findMonthlyCoverageSchema = z.object({ plate: plateSchema }).strict()

export const subscriptionReceiptSchema = z.object({ subscriptionId: subscriptionIdSchema }).strict()

export type CreateMonthlyCustomerInput = z.infer<typeof createMonthlyCustomerSchema>
export type UpdateMonthlyCustomerInput = z.infer<typeof updateMonthlyCustomerSchema>
export type CreateMonthlyPlanInput = z.infer<typeof createMonthlyPlanSchema>
export type UpdateMonthlyPlanInput = z.infer<typeof updateMonthlyPlanSchema>
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>
export type RegisterSubscriptionPaymentInput = z.infer<typeof registerSubscriptionPaymentSchema>
export type ListMonthlyInput = z.infer<typeof listMonthlySchema>
