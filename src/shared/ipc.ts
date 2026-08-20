import { z } from 'zod'
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

export const updateSettingsSchema = z
  .object({
    printerName: z.string().trim().min(1).max(200).nullable().optional(),
    paperWidth: paperWidthSchema.optional(),
    showPrintDialog: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Incluye al menos un ajuste')

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

const requiredText = (label: string, min: number, max: number) =>
  z.string().trim().min(min, `${label} es obligatorio`).max(max, `${label} es demasiado largo`)

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
