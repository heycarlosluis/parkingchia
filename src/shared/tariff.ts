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
export const MIN_PLENA_THRESHOLD_HOURS = 1
export const MAX_PLENA_THRESHOLD_HOURS = 24
export const MIN_PLENA_HOURS = 2
export const MAX_PLENA_HOURS = 24
export const MAX_GRACE_MINUTES = 240
export const MIN_GRACE_FROM_HOUR = 0
export const MAX_GRACE_FROM_HOUR = 24
export const MAX_AMOUNT_COP = 10_000_000
export const MAX_TAX_PERCENT = 100

export const ROUNDING_STEPS_COP = [0, 50, 100, 500, 1000] as const

export type TariffCurrency = typeof TARIFF_CURRENCY
export type TariffBillingUnit = 'hour' | 'minute'
export type RatePlanBillingUnit = TariffBillingUnit | 'day' | 'month'
/**
 * Tipos de vehículo que pueden entrar a un parqueadero.
 *
 * El orden es el que ve el operador y va de lo más frecuente a lo más raro.
 * Ningún tipo aparece en Registrar ingreso hasta que exista una tarifa activa
 * para él (D-027), así que ampliar la lista no complica la pantalla.
 *
 * Cada valor es también parte de las restricciones `CHECK` de `vehicles` y
 * `rate_plans`: agregar uno exige una migración.
 */
export const VEHICLE_TYPES = [
  'car',
  'pickup',
  'van',
  'taxi',
  'bus',
  'truck',
  'motorcycle',
  'scooter',
  'bicycle',
  'other',
] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]
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
  /**
   * Hora cobrable a partir de la cual la tolerancia empieza a perdonar.
   *
   * Con `1`, la primera hora se cobra completa desde el minuto cero y la
   * gracia solo entra al superarla: con 5 minutos de tolerancia, salir a la
   * hora y 5 cobra una hora y a la hora y 6 cobra dos. Con `0` la tolerancia
   * también perdona el primer tramo, así que salir dentro de la gracia no
   * genera cobro. Cobrando por minuto la gracia solo funciona como umbral
   * inicial gratuito cuando este valor es `0`.
   */
  graceFromHour: number
  currency: TariffCurrency
  taxEnabled: boolean
  taxPercent: number
  /** `true` cuando el precio de la tarifa ya incluye el IVA. */
  taxIncludedInPrice: boolean
  /**
   * Máximo de horas sueltas que se cobran antes de pasar a la plena.
   *
   * Con 5 horas y la hora a 3.500, cinco horas cumplidas cobran 17.500; la
   * primera hora que las supera cambia el cobro por la plena de la tarifa.
   * Solo aplica cobrando por hora.
   */
  plenaThresholdHours: number
  /**
   * Horas que cubre una plena antes de volver a cobrar por hora.
   *
   * Con 12 horas, la plena vale hasta esa marca; la primera hora que la supera
   * cobra la plena más las horas sueltas del ciclo siguiente, que vuelve a
   * convertirse en plena al superar el umbral. Debe ser mayor que el umbral.
   */
  plenaHours: number
  /** Múltiplo al que se redondea hacia arriba el total a cobrar. `0` desactiva el redondeo. */
  roundingStepCop: RoundingStepCop
}

export const DEFAULT_TARIFF_SETTINGS: TariffSettings = {
  billingUnit: 'hour',
  graceMinutes: 15,
  graceFromHour: 1,
  currency: TARIFF_CURRENCY,
  taxEnabled: false,
  taxPercent: 19,
  taxIncludedInPrice: true,
  plenaThresholdHours: 5,
  plenaHours: 12,
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
  /** Hora cobrable desde la que la tolerancia estuvo activa. */
  graceFromHour: number
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
  pickup: 'Camioneta',
  van: 'Van o furgón',
  taxi: 'Taxi',
  bus: 'Autobús',
  truck: 'Camión',
  motorcycle: 'Motocicleta',
  scooter: 'Patineta eléctrica',
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
 * El tiempo avanza en ciclos de `plenaHours`. Dentro de cada ciclo se cobran
 * horas sueltas mientras no se supere el umbral, y la primera hora que lo
 * supera congela el tramo en el precio de la plena hasta cerrar el ciclo.
 * Con umbral de 5 y plena de 12: cinco horas cobran cinco horas, seis horas ya
 * cobran una plena, doce horas siguen cobrando una plena, trece cobran una
 * plena más una hora y dieciocho cobran dos plenas.
 * Cobrando por minuto no se aplican plenas.
 */
export function splitIntoPlenas(
  billedUnits: number,
  billingUnit: TariffBillingUnit,
  plena: { thresholdHours: number; plenaHours: number } | null,
): PlenaSplit {
  if (plena === null || billingUnit !== 'hour') {
    return { plenaCount: 0, chargedUnits: billedUnits }
  }

  const fullPlenas = Math.floor(billedUnits / plena.plenaHours)
  const restHours = billedUnits % plena.plenaHours
  const restExceedsThreshold = restHours > plena.thresholdHours

  return {
    plenaCount: fullPlenas + (restExceedsThreshold ? 1 : 0),
    chargedUnits: restExceedsThreshold ? 0 : restHours,
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
 * supera la gracia, y la gracia únicamente está activa desde la hora indicada
 * en `graceFromHour`. Por minuto no hay fracción posible, así que la gracia
 * funciona como umbral inicial y solo existe con el umbral en la hora cero.
 */
export function calculateBillableUnits(
  totalMinutes: number,
  billingUnit: TariffBillingUnit,
  graceMinutes: number,
  graceFromHour: number,
): BillableUnits {
  if (billingUnit === 'minute') {
    const free = graceFromHour === 0 && totalMinutes <= graceMinutes
    return {
      billedUnits: free ? 0 : totalMinutes,
      forgivenMinutes: free ? totalMinutes : 0,
    }
  }

  const completeUnits = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const remainder = totalMinutes % MINUTES_PER_HOUR
  // La tolerancia solo perdona la fracción cuando ya se consumieron las horas
  // que la habilitan: con el umbral en 1, la primera hora se cobra completa
  // desde el minuto uno y la gracia recién aparece al pasar de esa hora.
  const graceActive = completeUnits >= graceFromHour
  const chargeRemainder = remainder > 0 && !(graceActive && remainder <= graceMinutes)
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
    settings.graceFromHour,
  )

  if (billedUnits === 0) {
    return {
      currency: TARIFF_CURRENCY,
      billingUnit: settings.billingUnit,
      totalMinutes,
      graceMinutes,
      graceFromHour: settings.graceFromHour,
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
      : { thresholdHours: settings.plenaThresholdHours, plenaHours: settings.plenaHours },
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
    graceFromHour: settings.graceFromHour,
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
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES)
export const ratePlanStatusSchema = z.enum(['active', 'inactive'])

export const graceMinutesSchema = z
  .number()
  .int('El tiempo de gracia debe ser un número entero de minutos')
  .min(0, 'El tiempo de gracia no puede ser negativo')
  .max(MAX_GRACE_MINUTES, `El tiempo de gracia no puede superar ${MAX_GRACE_MINUTES} minutos`)

export const graceFromHourSchema = z
  .number()
  .int('La hora desde la que aplica la tolerancia debe ser un número entero')
  .min(MIN_GRACE_FROM_HOUR, 'La hora desde la que aplica la tolerancia no puede ser negativa')
  .max(
    MAX_GRACE_FROM_HOUR,
    `La tolerancia no puede empezar después de la hora ${MAX_GRACE_FROM_HOUR}`,
  )

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

export const plenaHoursSchema = z
  .number()
  .int('La duración de la plena debe ser un número entero de horas')
  .min(MIN_PLENA_HOURS, 'La duración de la plena debe ser al menos de dos horas')
  .max(MAX_PLENA_HOURS, `La duración de la plena no puede superar ${MAX_PLENA_HOURS} horas`)

export const roundingStepSchema = z
  .number()
  .int()
  .refine(
    (value): value is RoundingStepCop => (ROUNDING_STEPS_COP as readonly number[]).includes(value),
    'Selecciona un redondeo permitido',
  )

/**
 * Regla cruzada entre el umbral y la duración de la plena.
 *
 * Vive aparte porque el ajuste se puede guardar campo por campo: la validación
 * necesita el resultado combinado, no el fragmento que llega en la petición.
 */
export const PLENA_THRESHOLD_MESSAGE =
  'El umbral de la plena debe ser menor que la duración de la plena'

export function plenaThresholdFitsPlena(value: {
  plenaThresholdHours: number
  plenaHours: number
}): boolean {
  return value.plenaThresholdHours < value.plenaHours
}

export const tariffSettingsInputSchema = z
  .object({
    billingUnit: tariffBillingUnitSchema,
    graceMinutes: graceMinutesSchema,
    graceFromHour: graceFromHourSchema,
    taxEnabled: z.boolean(),
    taxPercent: taxPercentSchema,
    taxIncludedInPrice: z.boolean(),
    plenaThresholdHours: plenaThresholdSchema,
    plenaHours: plenaHoursSchema,
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
