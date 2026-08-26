import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { z, ZodType } from 'zod'
import type { ApiResult, AppStatus, BackupResult } from '@shared/contracts'
import {
  cancelSessionSchema,
  cancelSubscriptionSchema,
  cashSessionReceiptSchema,
  closeCashSessionSchema,
  closeSessionSchema,
  completeOnboardingSchema,
  createEmployeeSchema,
  createMonthlyCustomerSchema,
  createMonthlyPlanSchema,
  createRatePlanSchema,
  createSubscriptionSchema,
  deleteEmployeeSchema,
  deleteMonthlyCustomerSchema,
  deleteMonthlyPlanSchema,
  deleteRatePlanSchema,
  findMonthlyCoverageSchema,
  IPC_CHANNELS,
  listActiveSessionsSchema,
  listExitsSchema,
  listMonthlySchema,
  openCashSessionSchema,
  parkingProfileSchema,
  quoteSessionSchema,
  registerEntrySchema,
  registerSubscriptionPaymentSchema,
  removePinSchema,
  renewSubscriptionSchema,
  setPinSchema,
  simulateChargeSchema,
  subscriptionReceiptSchema,
  unlockPinSchema,
  updateEmployeeSchema,
  updateMonthlyCustomerSchema,
  updateMonthlyPlanSchema,
  updateRatePlanSchema,
  updateSettingsSchema,
  updateTariffSettingsSchema,
  voidPaymentSchema,
} from '@shared/ipc'
import type { DatabaseManager } from '@main/database/connection'
import type { ElectronTicketPrinter } from '@main/printing/service'
import type { AccessService } from '@main/security/access-service'
import type { SettingsService } from '@main/settings/service'
import type { CashService } from '@main/cash/service'
import type { EmployeeService } from '@main/employee/service'
import type { MonthlyService } from '@main/monthly/service'
import type { ParkingService } from '@main/parking/service'
import type { TariffService } from '@main/tariffs/service'
import { OperationError } from '@main/ipc/errors'
import type { UpdateService } from '@main/updates/service'

type Services = {
  database: DatabaseManager
  settings: SettingsService
  printing: ElectronTicketPrinter
  updates: UpdateService
  access: AccessService
  tariffs: TariffService
  parking: ParkingService
  monthly: MonthlyService
  cash: CashService
  employees: EmployeeService
}

function success<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function failure(code: string, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } }
}

async function safely<T>(operation: () => T | Promise<T>): Promise<ApiResult<T>> {
  try {
    return success(await operation())
  } catch (error) {
    if (error instanceof OperationError) return failure(error.code, error.message)
    return failure(
      'OPERATION_FAILED',
      'No fue posible completar la operación. Vuelve a intentarlo.',
    )
  }
}

/** Convierte un fallo de validación en un mensaje accionable para el operador. */
function parseOrReject<Schema extends ZodType>(schema: Schema, rawInput: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) {
    throw new OperationError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.',
    )
  }
  return parsed.data
}

export function registerIpcHandlers(services: Services): void {
  const withAccess = <T>(operation: () => T | Promise<T>): Promise<ApiResult<T>> =>
    safely(() => {
      services.access.assertApplicationAccess()
      return operation()
    })

  ipcMain.handle(IPC_CHANNELS.ACCESS_GET_STATE, () => safely(() => services.access.getState()))
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_COMPLETE, (_event, rawInput: unknown) =>
    safely(() => {
      const parsed = completeOnboardingSchema.parse(rawInput)
      return services.access.completeOnboarding(parsed)
    }),
  )
  ipcMain.handle(IPC_CHANNELS.PROFILE_UPDATE, (_event, rawInput: unknown) =>
    safely(() => services.access.updateProfile(parkingProfileSchema.parse(rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.SECURITY_UNLOCK, (_event, rawInput: unknown) =>
    safely(() => services.access.unlock(unlockPinSchema.parse(rawInput).pin)),
  )
  ipcMain.handle(IPC_CHANNELS.SECURITY_LOCK, () => withAccess(() => services.access.lock()))
  ipcMain.handle(IPC_CHANNELS.SECURITY_PIN_SET, (_event, rawInput: unknown) =>
    withAccess(() => services.access.setPin(setPinSchema.parse(rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.SECURITY_PIN_REMOVE, (_event, rawInput: unknown) =>
    withAccess(() => services.access.removePin(removePinSchema.parse(rawInput).currentPin)),
  )

  ipcMain.handle(IPC_CHANNELS.APP_STATUS, () =>
    withAccess<AppStatus>(() => {
      const row = services.database
        .getNativeConnection()
        .prepare("SELECT count(*) AS total FROM parking_sessions WHERE status = 'active'")
        .get() as { total: number }
      return {
        name: services.access.getState().profile?.name ?? 'Parking Chía',
        version: app.getVersion(),
        isPackaged: app.isPackaged,
        database: services.database.getStatus(),
        activeSessions: row.total,
      }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.TARIFF_GET, () =>
    withAccess(() => services.tariffs.getConfiguration()),
  )
  ipcMain.handle(IPC_CHANNELS.TARIFF_SETTINGS_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.tariffs.updateSettings(parseOrReject(updateTariffSettingsSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.TARIFF_PLAN_CREATE, (_event, rawInput: unknown) =>
    withAccess(() => services.tariffs.createPlan(parseOrReject(createRatePlanSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.TARIFF_PLAN_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() => services.tariffs.updatePlan(parseOrReject(updateRatePlanSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.TARIFF_PLAN_DELETE, (_event, rawInput: unknown) =>
    withAccess(() => services.tariffs.deletePlan(parseOrReject(deleteRatePlanSchema, rawInput).id)),
  )
  ipcMain.handle(IPC_CHANNELS.TARIFF_SIMULATE, (_event, rawInput: unknown) =>
    withAccess(() => services.tariffs.simulate(parseOrReject(simulateChargeSchema, rawInput))),
  )

  ipcMain.handle(IPC_CHANNELS.PARKING_ENTRY, (_event, rawInput: unknown) =>
    withAccess(async () => {
      const entry = services.parking.registerEntry(parseOrReject(registerEntrySchema, rawInput))
      const print = await services.printing.printEntryTicket(entry)
      return { ...entry, printed: print.printed, printMessage: print.message }
    }),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_ACTIVE_LIST, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.parking.listActiveSessions(parseOrReject(listActiveSessionsSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_QUOTE_EXIT, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.parking.quoteExit(parseOrReject(quoteSessionSchema, rawInput).sessionId),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_CLOSE, (_event, rawInput: unknown) =>
    withAccess(async () => {
      const exit = services.parking.closeSession(parseOrReject(closeSessionSchema, rawInput))
      if (exit.receiptNumber === null) return exit
      const print = await services.printing.printExitReceipt(
        services.parking.findReceiptSnapshot(exit.sessionId),
      )
      return { ...exit, printed: print.printed, printMessage: print.message }
    }),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_CANCEL, (_event, rawInput: unknown) =>
    withAccess(() => services.parking.cancelSession(parseOrReject(cancelSessionSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_ENTRY_REPRINT, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.printing.printEntryTicket(
        services.parking.findEntryRegistration(
          parseOrReject(quoteSessionSchema, rawInput).sessionId,
        ),
        { reprint: true },
      ),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.PARKING_REPRINT, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.printing.printExitReceipt(
        services.parking.findReceiptSnapshot(parseOrReject(quoteSessionSchema, rawInput).sessionId),
        { reprint: true },
      ),
    ),
  )

  ipcMain.handle(IPC_CHANNELS.PARKING_EXIT_HISTORY, (_event, rawInput: unknown) =>
    withAccess(() => services.parking.listExits(parseOrReject(listExitsSchema, rawInput))),
  )

  ipcMain.handle(IPC_CHANNELS.MONTHLY_OVERVIEW, (_event, rawInput: unknown) =>
    withAccess(() => services.monthly.getOverview(parseOrReject(listMonthlySchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_CUSTOMER_CREATE, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.createCustomer(parseOrReject(createMonthlyCustomerSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_CUSTOMER_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.updateCustomer(parseOrReject(updateMonthlyCustomerSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_CUSTOMER_DELETE, (_event, rawInput: unknown) =>
    withAccess(() => {
      services.monthly.deleteCustomer(parseOrReject(deleteMonthlyCustomerSchema, rawInput).id)
    }),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_PLAN_CREATE, (_event, rawInput: unknown) =>
    withAccess(() => services.monthly.createPlan(parseOrReject(createMonthlyPlanSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_PLAN_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() => services.monthly.updatePlan(parseOrReject(updateMonthlyPlanSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_PLAN_DELETE, (_event, rawInput: unknown) =>
    withAccess(() => {
      services.monthly.deletePlan(parseOrReject(deleteMonthlyPlanSchema, rawInput).id)
    }),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_CREATE, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.createSubscription(parseOrReject(createSubscriptionSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_RENEW, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.renewSubscription(parseOrReject(renewSubscriptionSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_SUBSCRIPTION_CANCEL, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.cancelSubscription(parseOrReject(cancelSubscriptionSchema, rawInput)),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_PAYMENT_REGISTER, (_event, rawInput: unknown) =>
    withAccess(async () => {
      const registration = services.monthly.registerPayment(
        parseOrReject(registerSubscriptionPaymentSchema, rawInput),
      )
      const print = await services.printing.printMonthlyReceipt(
        services.monthly.findReceiptSnapshot(registration.subscriptionId),
      )
      return { ...registration, printed: print.printed, printMessage: print.message }
    }),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_RECEIPT_REPRINT, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.printing.printMonthlyReceipt(
        services.monthly.findReceiptSnapshot(
          parseOrReject(subscriptionReceiptSchema, rawInput).subscriptionId,
        ),
      ),
    ),
  )
  ipcMain.handle(IPC_CHANNELS.MONTHLY_COVERAGE_LOOKUP, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.monthly.findCoverageByPlate(
        parseOrReject(findMonthlyCoverageSchema, rawInput).plate,
      ),
    ),
  )

  ipcMain.handle(IPC_CHANNELS.CASH_GET_STATE, () => withAccess(() => services.cash.getState()))
  ipcMain.handle(IPC_CHANNELS.CASH_OPEN, (_event, rawInput: unknown) =>
    withAccess(() => services.cash.openSession(parseOrReject(openCashSessionSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.CASH_CLOSE, (_event, rawInput: unknown) =>
    withAccess(() => services.cash.closeSession(parseOrReject(closeCashSessionSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.CASH_PAYMENT_VOID, (_event, rawInput: unknown) =>
    withAccess(() => services.cash.voidPayment(parseOrReject(voidPaymentSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.CASH_SESSIONS_LIST, () =>
    withAccess(() => services.cash.listClosedSessions()),
  )
  ipcMain.handle(IPC_CHANNELS.CASH_CLOSE_RECEIPT, (_event, rawInput: unknown) =>
    withAccess(() =>
      services.printing.printCashCloseReceipt(
        services.cash.getCloseSummary(parseOrReject(cashSessionReceiptSchema, rawInput).sessionId),
      ),
    ),
  )

  ipcMain.handle(IPC_CHANNELS.EMPLOYEES_LIST, () => withAccess(() => services.employees.list()))
  ipcMain.handle(IPC_CHANNELS.EMPLOYEE_CREATE, (_event, rawInput: unknown) =>
    withAccess(() => services.employees.create(parseOrReject(createEmployeeSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.EMPLOYEE_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() => services.employees.update(parseOrReject(updateEmployeeSchema, rawInput))),
  )
  ipcMain.handle(IPC_CHANNELS.EMPLOYEE_DELETE, (_event, rawInput: unknown) =>
    withAccess(() => {
      services.employees.delete(parseOrReject(deleteEmployeeSchema, rawInput).id)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => withAccess(() => services.settings.get()))
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, rawInput: unknown) =>
    withAccess(() => {
      const parsed = updateSettingsSchema.safeParse(rawInput)
      if (!parsed.success) {
        throw new Error('Ajustes no válidos')
      }
      return services.settings.update(parsed.data)
    }),
  )
  ipcMain.handle(IPC_CHANNELS.PRINTERS_LIST, () =>
    withAccess(() => services.printing.listPrinters()),
  )
  ipcMain.handle(IPC_CHANNELS.PRINT_TEST, () =>
    withAccess(() => services.printing.printTestTicket()),
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, () =>
    withAccess<BackupResult>(async () => {
      const defaultName = `parkingchia-backup-${new Date().toISOString().slice(0, 10)}.sqlite`
      const result = await dialog.showSaveDialog({
        title: 'Guardar copia de seguridad',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Base de datos SQLite', extensions: ['sqlite'] }],
      })
      if (result.canceled || !result.filePath) {
        return { created: false, message: 'No se creó ninguna copia de seguridad.' }
      }
      await services.database.backupTo(result.filePath)
      services.database
        .getNativeConnection()
        .prepare(
          'INSERT INTO audit_logs (id, action, entity_type, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          randomUUID(),
          'database.backup_created',
          'database',
          'local-operator',
          JSON.stringify({ destination: 'user-selected' }),
          new Date().toISOString(),
        )
      return { created: true, message: 'Copia de seguridad creada correctamente.' }
    }),
  )

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, () => withAccess(() => services.updates.getState()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => withAccess(() => services.updates.check()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, () => withAccess(() => services.updates.download()))
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () =>
    withAccess(() => {
      services.updates.install()
    }),
  )
}

export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
}
