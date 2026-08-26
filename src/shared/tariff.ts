import { z } from 'zod'
import { elapsedMinutes } from './format'

/**
 * Política tarifaria de Parking Chía.
 *
 * Todos los importes son enteros en pesos colombianos. El módulo no conoce
 * SQLite ni React: recibe minutos y devuelve un desglose reproducible.
 */

export const TARIFF_CURRENCY = 'COP'
export const TARIFF_CURRENCY_LABEL = 'Peso colombiano (COP)'

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 1440
export const HOURS_PER_DAY = 24
export const MIN_PLENA_THRESHOLD_HOURS = 1
export const MAX_PLENA_THRESHOLD_HOURS = 24
export const MAX_GRACE_MINUTES = 240
export const MAX_AMOUNT_COP = 10_000_000
export const MAX_TAX_PERCENT = 100

export const ROUNDING_STEPS_COP = [0, 50, 100, 500, 1000] as const

export type TariffCurrency = typeof TARIFF_CURRENCY
export type TariffBillingUnit = 'hour' | 'minute'
export type RatePlanBillingUnit = TariffBillingUnit | 'day' | 'month'
export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'other'
export type RatePlanStatus = 'active' | 'inactive'
export type RoundingStepCop = (typeof ROUNDING_STEPS_COP)[number]

export type TariffSettings = {
  /** Unidad con la que se convierte el tiempo en unidades cobrables. */
  billingUnit: TariffBillingUnit
  /**
   * Tolerancia en minutos sobre la fracción final.
   *
   * Con cobro por hora y 5 minutos de gracia, salir a la hora y 5 cobra una
   * hora y salir a la hora y 6 cobra dos. Con cobro por minuto no existe una
   * fracción, así que actúa como umbral inicial: hasta la gracia no se cobra.
   */
  graceMinutes: number
  currency: TariffCurrency
  taxEnabled: boolean
  taxPercent: number
  /** `true` cuando el precio de la tarifa ya incluye el IVA. */
  taxIncludedInPrice: boolean
  /**
   * Horas cobrables a partir de las cuales el tramo se convierte en una plena.
   *
   * Con 10 horas, alcanzar la décima hora deja de sumar horas sueltas y cobra
   * el precio de la plena de la tarifa. Solo aplica cobrando por hora.
   */
  plenaThresholdHours: number
  /** Múltiplo al que se redondea hacia arriba el total a cobrar. `0` desactiva el redondeo. */
  roundingStepCop: RoundingStepCop
}

export const DEFAULT_TARIFF_SETTINGS: TariffSettings = {
  billingUnit: 'hour',
  graceMinutes: 15,
  currency: TARIFF_CURRENCY,
  taxEnabled: false,
  taxPercent: 19,
  taxIncludedInPrice: true,
  plenaThresholdHours: 10,
  roundingStepCop: 100,
}

export type RatePlanPricing = {
  amountCop: number
  minimumChargeCop: number
  /** Precio del día completo. `null` desactiva la plena para esta tarifa. */
  plenaCop: number | null
  /** `null` usa la gracia general de la configuración. */
  graceMinutes: number | null
}

export type ParkingCharge = {
  currency: TariffCurrency
  billingUnit: TariffBillingUnit
  totalMinutes: number
  graceMinutes: number
  /** `true` cuando la permanencia no generó ningún cobro. */
  withinGrace: boolean
  /** Minutos de la fracción final que la tolerancia dejó sin cobrar. */
  forgivenMinutes: number
  /** Unidades cobrables totales antes de repartirlas en plenas. */
  billedUnits: number
  /** Días completos cobrados como plena. */
  plenaCount: number
  /** Precio aplicado a cada plena. */
  plenaUnitCop: number
  /** Unidades cobradas por separado, fuera de las plenas. */
  chargedUnits: number
  baseCop: number
  appliedMinimumCharge: boolean
  roundingAdjustmentCop: number
  subtotalCop: number
  taxPercent: number
  taxCop: number
  totalCop: number
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: 'Automóvil',
  motorcycle: 'Motocicleta',
  bicycle: 'Bicicleta',
  other: 'Otro',
}

export const BILLING_UNIT_LABELS: Record<TariffBillingUnit, { singular: string; plural: string }> =
  {
    hour: { singular: 'hora', plural: 'horas' },
    minute: { singular: 'minuto', plural: 'minutos' },
  }

export function describeBillingUnit(unit: TariffBillingUnit, quantity = 1): string {
  const labels = BILLING_UNIT_LABELS[unit]
  return quantity === 1 ? labels.singular : labels.plural
}

/** Frase corta que explica al operador qué se está cobrando y qué se perdonó. */
export function describeBilledTime(charge: ParkingCharge): string {
  if (charge.withinGrace) {
    return `Sin cobro · dentro de la tolerancia de ${charge.graceMinutes} min`
  }

  const parts: string[] = []
  if (charge.plenaCount > 0) {
    parts.push(`${charge.plenaCount} ${charge.plenaCount === 1 ? 'plena' : 'plenas'}`)
  }
  if (charge.chargedUnits > 0 || parts.length === 0) {
    parts.push(
      `${charge.chargedUnits} ${describeBillingUnit(charge.billingUnit, charge.chargedUnits)}`,
    )
  }

  const summary = parts.join(' + ')
  return charge.forgivenMinutes > 0
    ? `${summary} · ${charge.forgivenMinutes} min de tolerancia`
    : summary
}

export type PlenaSplit = {
  plenaCount: number
  chargedUnits: number
}

/**
 * Reparte las unidades cobrables entre plenas y unidades sueltas.
 *
 * Cada 24 horas cobrables son una plena. El resto se convierte en otra plena
 * cuando alcanza el umbral configurado; si no lo alcanza, se cobra por hora.
 * Cobrando por minuto no se aplican plenas.
 */
export function splitIntoPlenas(
  billedUnits: number,
  billingUnit: TariffBillingUnit,
  plena: { thresholdHours: number; priceCop: number } | null,
): PlenaSplit {
  if (plena === null || billingUnit !== 'hour') {
    return { plenaCount: 0, chargedUnits: billedUnits }
  }

  const fullDays = Math.floor(billedUnits / HOURS_PER_DAY)
  const restHours = billedUnits % HOURS_PER_DAY
  const restReachesPlena = restHours >= plena.thresholdHours

  return {
    plenaCount: fullDays + (restReachesPlena ? 1 : 0),
    chargedUnits: restReachesPlena ? 0 : restHours,
  }
}

export function roundUpToStep(amountCop: number, stepCop: number): number {
  if (stepCop <= 0) return amountCop
  return Math.ceil(amountCop / stepCop) * stepCop
}

export function resolveGraceMinutes(settings: TariffSettings, plan: RatePlanPricing): number {
  return plan.graceMinutes ?? settings.graceMinutes
}

export type BillableUnits = {
  billedUnits: number
  forgivenMinutes: number
}

/**
 * Reparte la permanencia en unidades cobrables aplicando la tolerancia.
 *
 * Por hora: se cobran las horas completas y la fracción final solo cuando
 * supera la gracia. Por minuto no hay fracción posible, así que la gracia
 * funciona como umbral inicial.
 */
export function calculateBillableUnits(
  totalMinutes: number,
  billingUnit: TariffBillingUnit,
  graceMinutes: number,
): BillableUnits {
  if (billingUnit === 'minute') {
    const free = totalMinutes <= graceMinutes
    return {
      billedUnits: free ? 0 : totalMinutes,
      forgivenMinutes: free ? totalMinutes : 0,
    }
  }

  const completeUnits = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const remainder = totalMinutes % MINUTES_PER_HOUR
  const chargeRemainder = remainder > graceMinutes
  return {
    billedUnits: completeUnits + (chargeRemainder ? 1 : 0),
    forgivenMinutes: chargeRemainder ? 0 : remainder,
  }
}

/**
 * Convierte una permanencia en el desglose del cobro.
 *
 * Reglas aplicadas en orden: unidades cobrables con tolerancia, tope diario,
 * cobro mínimo, IVA y redondeo del total.
 */
export function calculateChargeForMinutes(
  totalMinutes: number,
  settings: TariffSettings,
  plan: RatePlanPricing,
): ParkingCharge {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) {
    throw new RangeError('La permanencia debe ser un número entero de minutos')
  }

  const graceMinutes = resolveGraceMinutes(settings, plan)
  const taxPercent = settings.taxEnabled ? settings.taxPercent : 0
  const taxRate = taxPercent / 100
  const { billedUnits, forgivenMinutes } = calculateBillableUnits(
    totalMinutes,
    settings.billingUnit,
    graceMinutes,
  )

  if (billedUnits === 0) {
    return {
      currency: TARIFF_CURRENCY,
      billingUnit: settings.billingUnit,
      totalMinutes,
      graceMinutes,
      withinGrace: true,
      forgivenMinutes,
      billedUnits: 0,
      plenaCount: 0,
      plenaUnitCop: 0,
      chargedUnits: 0,
      baseCop: 0,
      appliedMinimumCharge: false,
      roundingAdjustmentCop: 0,
      subtotalCop: 0,
      taxPercent,
      taxCop: 0,
      totalCop: 0,
    }
  }

  const { plenaCount, chargedUnits } = splitIntoPlenas(
    billedUnits,
    settings.billingUnit,
    plan.plenaCop === null
      ? null
      : { thresholdHours: settings.plenaThresholdHours, priceCop: plan.plenaCop },
  )
  const plenaUnitCop = plenaCount > 0 ? (plan.plenaCop ?? 0) : 0

  let baseCop = plenaCount * plenaUnitCop + chargedUnits * plan.amountCop

  let appliedMinimumCharge = false
  if (baseCop < plan.minimumChargeCop) {
    baseCop = plan.minimumChargeCop
    appliedMinimumCharge = true
  }

  const grossCop =
    settings.taxEnabled && !settings.taxIncludedInPrice
      ? Math.round(baseCop * (1 + taxRate))
      : baseCop
  const totalCop = roundUpToStep(grossCop, settings.roundingStepCop)
  const subtotalCop = settings.taxEnabled ? Math.round(totalCop / (1 + taxRate)) : totalCop

  return {
    currency: TARIFF_CURRENCY,
    billingUnit: settings.billingUnit,
    totalMinutes,
    graceMinutes,
    withinGrace: false,
    forgivenMinutes,
    billedUnits,
    plenaCount,
    plenaUnitCop,
    chargedUnits,
    baseCop,
    appliedMinimumCharge,
    roundingAdjustmentCop: totalCop - grossCop,
    subtotalCop,
    taxPercent,
    taxCop: totalCop - subtotalCop,
    totalCop,
  }
}

export function calculateParkingCharge(input: {
  enteredAt: string
  exitedAt: string
  settings: TariffSettings
  plan: RatePlanPricing
}): ParkingCharge {
  return calculateChargeForMinutes(
    elapsedMinutes(input.enteredAt, input.exitedAt),
    input.settings,
    input.plan,
  )
}

const copAmount = (label: string) =>
  z
    .number()
    .int(`${label} debe ser un valor entero en pesos`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_AMOUNT_COP, `${label} supera el máximo permitido`)

export const tariffBillingUnitSchema = z.enum(['hour', 'minute'])
export const ratePlanBillingUnitSchema = z.enum(['hour', 'minute', 'day', 'month'])
export const vehicleTypeSchema = z.enum(['car', 'motorcycle', 'bicycle', 'other'])
export const ratePlanStatusSchema = z.enum(['active', 'inactive'])

export const graceMinutesSchema = z
  .number()
  .int('El tiempo de gracia debe ser un número entero de minutos')
  .min(0, 'El tiempo de gracia no puede ser negativo')
  .max(MAX_GRACE_MINUTES, `El tiempo de gracia no puede superar ${MAX_GRACE_MINUTES} minutos`)

export const taxPercentSchema = z
  .number()
  .min(0, 'El IVA no puede ser negativo')
  .max(MAX_TAX_PERCENT, 'El IVA no puede superar 100 %')
  // `Math.round` siempre devuelve un entero, así que la comprobación real es
  // que el valor no tenga más de dos decimales.
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
    'Usa máximo dos decimales en el IVA',
  )

export const plenaThresholdSchema = z
  .number()
  .int('El umbral de la plena debe ser un número entero de horas')
  .min(MIN_PLENA_THRESHOLD_HOURS, 'El umbral de la plena debe ser al menos de una hora')
  .max(MAX_PLENA_THRESHOLD_HOURS, 'El umbral de la plena no puede superar 24 horas')

export const roundingStepSchema = z
  .number()
  .int()
  .refine(
    (value): value is RoundingStepCop => (ROUNDING_STEPS_COP as readonly number[]).includes(value),
    'Selecciona un redondeo permitido',
  )

export const tariffSettingsInputSchema = z
  .object({
    billingUnit: tariffBillingUnitSchema,
    graceMinutes: graceMinutesSchema,
    taxEnabled: z.boolean(),
    taxPercent: taxPercentSchema,
    taxIncludedInPrice: z.boolean(),
    plenaThresholdHours: plenaThresholdSchema,
    roundingStepCop: roundingStepSchema,
  })
  .strict()

export const updateTariffSettingsSchema = tariffSettingsInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Incluye al menos un ajuste de tarifas')

const ratePlanShape = {
  name: z
    .string()
    .trim()
    .min(2, 'El nombre de la tarifa es obligatorio')
    .max(60, 'El nombre de la tarifa es demasiado largo'),
  vehicleType: vehicleTypeSchema,
  amountCop: copAmount('El precio'),
  minimumChargeCop: copAmount('El cobro mínimo'),
  plenaCop: copAmount('El valor de la plena').nullable(),
  graceMinutes: graceMinutesSchema.nullable(),
  status: ratePlanStatusSchema,
}

const plenaAboveMinimum = (value: { plenaCop: number | null; minimumChargeCop: number }): boolean =>
  value.plenaCop === null || value.plenaCop >= value.minimumChargeCop

const plenaIssue = (): { message: string; path: PropertyKey[] } => ({
  message: 'La plena no puede costar menos que el cobro mínimo',
  path: ['plenaCop'],
})

export const ratePlanIdSchema = z.string().trim().min(1).max(64)

export const ratePlanInputSchema = z
  .object(ratePlanShape)
  .strict()
  .refine(plenaAboveMinimum, plenaIssue())

export const createRatePlanSchema = ratePlanInputSchema

export const updateRatePlanSchema = z
  .object({ id: ratePlanIdSchema, ...ratePlanShape })
  .strict()
  .refine(plenaAboveMinimum, plenaIssue())

export const deleteRatePlanSchema = z.object({ id: ratePlanIdSchema }).strict()

export const simulateChargeSchema = z
  .object({
    ratePlanId: ratePlanIdSchema,
    minutes: z
      .number()
      .int('Los minutos deben ser un número entero')
      .min(0, 'Los minutos no pueden ser negativos')
      .max(MINUTES_PER_DAY * 31, 'La simulación admite hasta 31 días'),
  })
  .strict()

export type TariffSettingsInput = z.infer<typeof tariffSettingsInputSchema>
export type UpdateTariffSettingsInput = z.infer<typeof updateTariffSettingsSchema>
export type CreateRatePlanInput = z.infer<typeof createRatePlanSchema>
export type UpdateRatePlanInput = z.infer<typeof updateRatePlanSchema>
export type SimulateChargeInput = z.infer<typeof simulateChargeSchema>
