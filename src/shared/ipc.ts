import { z } from 'zod'
import { describeNitError, normalizeNit, parseNit } from './nit'
export { IPC_CHANNELS } from './ipc-channels'
export {
  cashSessionReceiptSchema,
  closeCashSessionSchema,
  openCashSessionSchema,
  voidPaymentSchema,
} from './cash'
export { createEmployeeSchema, deleteEmployeeSchema, updateEmployeeSchema } from './employee'
export {
  cancelSessionSchema,
  closeSessionSchema,
  listActiveSessionsSchema,
  listExitsSchema,
  quoteSessionSchema,
  registerEntrySchema,
  resolveExitTargetSchema,
} from './parking'
export {
  cancelSubscriptionSchema,
  createMonthlyCustomerSchema,
  createMonthlyPlanSchema,
  createSubscriptionSchema,
  deleteMonthlyCustomerSchema,
  deleteMonthlyPlanSchema,
  findMonthlyCoverageSchema,
  listMonthlySchema,
  registerSubscriptionPaymentSchema,
  renewSubscriptionSchema,
  subscriptionReceiptSchema,
  updateMonthlyCustomerSchema,
  updateMonthlyPlanSchema,
} from './monthly'
export {
  createRatePlanSchema,
  deleteRatePlanSchema,
  simulateChargeSchema,
  updateRatePlanSchema,
  updateTariffSettingsSchema,
} from './tariff'

export const paperWidthSchema = z.enum(['58mm', '80mm'])

export const MIN_PRINT_WIDTH_MM = 40
export const MAX_PRINT_WIDTH_MM = 80
export const MAX_PRINT_OFFSET_MM = 10

/** Medio milímetro basta para calibrar y evita valores que el operador no puede leer en la guía. */
const halfMillimeters = (label: string, min: number, max: number) =>
  z
    .number()
    .min(min, `${label} debe ser al menos ${min} mm`)
    .max(max, `${label} debe ser máximo ${max} mm`)
    .refine(
      (value) => Number.isInteger(value * 2),
      `${label} se ajusta de medio en medio milímetro`,
    )

export const updateSettingsSchema = z
  .object({
    printerName: z.string().trim().min(1).max(200).nullable().optional(),
    paperWidth: paperWidthSchema.optional(),
    showPrintDialog: z.boolean().optional(),
    printWidthMm: halfMillimeters('El ancho de impresión', MIN_PRINT_WIDTH_MM, MAX_PRINT_WIDTH_MM)
      .nullable()
      .optional(),
    printOffsetMm: halfMillimeters(
      'El ajuste horizontal',
      -MAX_PRINT_OFFSET_MM,
      MAX_PRINT_OFFSET_MM,
    ).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Incluye al menos un ajuste')

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

const requiredText = (label: string, min: number, max: number) =>
  z.string().trim().min(min, `${label} es obligatorio`).max(max, `${label} es demasiado largo`)

/** Un logo de 1 MB ocupa cerca de 1,4 MB al viajar como data URL base64. */
export const MAX_LOGO_BYTES = 1_000_000
const MAX_LOGO_DATA_URL_LENGTH = 1_400_000

export const parkingLogoSchema = z
  .string()
  .max(MAX_LOGO_DATA_URL_LENGTH, 'El logo debe pesar máximo 1 MB')
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    'Usa un logo PNG, JPEG o WebP válido',
  )
  .nullable()
  .optional()

/**
 * NIT opcional. Un campo vacío lo elimina; cualquier otro valor se valida con
 * el dígito de verificación de la DIAN y se guarda sin separadores de miles.
 */
export const parkingNitSchema = z
  .string()
  .max(40, 'El NIT es demasiado largo')
  .transform((value, context) => {
    if (value.trim() === '') return null
    const parsed = parseNit(value)
    if (parsed.ok) return normalizeNit(parsed.base, parsed.checkDigit)
    context.addIssue({ code: 'custom', message: describeNitError(parsed) })
    return z.NEVER
  })
  .nullable()
  .optional()

export const parkingProfileSchema = z
  .object({
    name: requiredText('El nombre', 2, 80),
    address: requiredText('La dirección', 5, 180),
    phone: z
      .string()
      .trim()
      .min(7, 'El teléfono es obligatorio')
      .max(25, 'El teléfono es demasiado largo')
      .regex(/^[+\d()\-\s]+$/, 'Usa un número de teléfono válido')
      .refine((value) => {
        const digits = value.replace(/\D/g, '')
        return digits.length >= 7 && digits.length <= 15
      }, 'Usa un número de teléfono entre 7 y 15 dígitos'),
    nit: parkingNitSchema,
    logoDataUrl: parkingLogoSchema,
  })
  .strict()

export const pinSchema = z.string().regex(/^\d{8}$/, 'El PIN debe tener exactamente 8 dígitos')

export const completeOnboardingSchema = parkingProfileSchema
  .extend({ pin: z.union([z.literal(''), pinSchema]) })
  .strict()

export const unlockPinSchema = z.object({ pin: pinSchema }).strict()

export const setPinSchema = z
  .object({
    currentPin: pinSchema.optional(),
    newPin: pinSchema,
  })
  .strict()

export const removePinSchema = z.object({ currentPin: pinSchema }).strict()

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
export type ParkingProfileInput = z.infer<typeof parkingProfileSchema>
export type SetPinInput = z.infer<typeof setPinSchema>
