import { z } from 'zod'

export const IPC_CHANNELS = {
  APP_STATUS: 'app:get-status',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  PRINTERS_LIST: 'printing:list-printers',
  PRINT_TEST: 'printing:test-ticket',
  BACKUP_CREATE: 'database:create-backup',
  UPDATE_GET_STATE: 'updates:get-state',
  UPDATE_CHECK: 'updates:check',
  UPDATE_DOWNLOAD: 'updates:download',
  UPDATE_INSTALL: 'updates:install',
  UPDATE_STATE_CHANGED: 'updates:state-changed',
} as const

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
