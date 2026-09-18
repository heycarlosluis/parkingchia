import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type {
  AccessState,
  AppSettings,
  ActiveSession,
  ApiResult,
  CashCloseSummary,
  CashState,
  Employee,
  ExitRecord,
  MonthlyCustomer,
  MonthlyOverview,
  MonthlySubscription,
  ParkingApi,
  RatePlan,
  TariffConfiguration,
  UpdateState,
} from '@shared/contracts'
import { coverageEndDate, startOfLocalDayUtc, todayLocalDate } from '@shared/monthly'
import { elapsedMinutes } from '@shared/format'
import { calculateChange } from '@shared/parking'
import { calculateChargeForMinutes, DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'

class ResizeObserverMock implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock

// Radix Select usa pointer capture y scrollIntoView; jsdom no los implementa.
if (typeof Element !== 'undefined') {
  const elementPrototype = Element.prototype as Element & {
    setPointerCapture?: (pointerId: number) => void
    releasePointerCapture?: (pointerId: number) => void
    hasPointerCapture?: (pointerId: number) => boolean
    scrollIntoView?: (options?: boolean | ScrollIntoViewOptions) => void
  }
  elementPrototype.setPointerCapture ??= () => {}
  elementPrototype.releasePointerCapture ??= () => {}
  elementPrototype.hasPointerCapture ??= () => false
  elementPrototype.scrollIntoView ??= () => {}
}

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

const updateState: UpdateState = {
  status: 'idle',
  currentVersion: '0.1.0-alpha.1',
  availableVersion: null,
  progress: null,
  message: 'Desactivadas durante el desarrollo.',
  canCheck: false,
}

const accessState: AccessState = {
  onboardingCompleted: true,
  profile: {
    name: 'Parking Chía',
    address: 'Carrera 10 # 12-34',
    phone: '300 123 4567',
  },
  pinConfigured: false,
  locked: false,
}

const ratePlan: RatePlan = {
  id: 'rate-car',
  name: 'Automóvil por hora',
  vehicleType: 'car',
  billingUnit: 'hour',
  amountCop: 5000,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
  status: 'active',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
}

const tariffConfiguration: TariffConfiguration = {
  settings: DEFAULT_TARIFF_SETTINGS,
  plans: [ratePlan],
}

const planPricing = {
  amountCop: 5000,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
}

/** Sesión de ejemplo con 90 minutos de permanencia estable para las pruebas. */
export const activeSession: ActiveSession = {
  id: 'session-1',
  plate: 'ABC123',
  vehicleType: 'car',
  ratePlanId: 'rate-car',
  ratePlanName: 'Automóvil por hora',
  enteredAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  notes: null,
  monthlyCoverage: null,
}

const monthlyPlan: RatePlan = {
  id: 'monthly-plan-car',
  name: 'Mensualidad automóvil',
  vehicleType: 'car',
  billingUnit: 'month',
  amountCop: 150_000,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
  status: 'active',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
}

export const monthlyCustomer: MonthlyCustomer = {
  id: 'customer-1',
  fullName: 'María Fernanda Ríos',
  documentNumber: '1020304050',
  phone: '300 123 4567',
  email: null,
  notes: null,
  status: 'active',
  activeSubscriptions: 1,
  subscriptionCount: 1,
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
}

const monthlyStart = todayLocalDate()

export const monthlySubscription: MonthlySubscription = {
  id: 'subscription-1',
  customerId: monthlyCustomer.id,
  customerName: monthlyCustomer.fullName,
  documentNumber: monthlyCustomer.documentNumber,
  vehicleId: 'vehicle-1',
  plate: 'MEN001',
  vehicleType: 'car',
  ratePlanId: monthlyPlan.id,
  planName: monthlyPlan.name,
  startsAt: startOfLocalDayUtc(monthlyStart),
  endsAt: startOfLocalDayUtc(coverageEndDate(monthlyStart, 1), 1),
  amountCop: 150_000,
  paidCop: 0,
  balanceCop: 150_000,
  paymentState: 'unpaid',
  status: 'active',
  notes: null,
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
}

const monthlyOverview: MonthlyOverview = {
  subscriptions: [monthlySubscription],
  customers: [monthlyCustomer],
  plans: [monthlyPlan],
  summary: {
    activeCount: 1,
    expiringSoonCount: 0,
    expiredCount: 0,
    pendingCollectionCop: 150_000,
    collectedThisMonthCop: 0,
  },
}

const chargeNow = (): ReturnType<typeof calculateChargeForMinutes> =>
  calculateChargeForMinutes(
    elapsedMinutes(activeSession.enteredAt, new Date().toISOString()),
    DEFAULT_TARIFF_SETTINGS,
    planPricing,
  )

export const exitRecords: ExitRecord[] = [
  {
    sessionId: 'session-closed',
    plate: 'ABC123',
    vehicleType: 'car',
    ratePlanName: 'Automóvil por hora',
    enteredAt: '2026-08-18T13:00:00.000Z',
    exitedAt: '2026-08-18T14:30:00.000Z',
    totalMinutes: 90,
    totalCop: 10_000,
    status: 'closed',
    method: 'cash',
    receiptNumber: 1,
    charge: calculateChargeForMinutes(90, DEFAULT_TARIFF_SETTINGS, planPricing),
    monthlyCustomerName: null,
  },
  {
    sessionId: 'session-cancelled',
    plate: 'ZZZ999',
    vehicleType: 'motorcycle',
    ratePlanName: 'Motocicleta por hora',
    enteredAt: '2026-08-18T12:00:00.000Z',
    exitedAt: '2026-08-18T12:04:00.000Z',
    totalMinutes: 4,
    totalCop: 0,
    status: 'cancelled',
    method: null,
    receiptNumber: null,
    charge: null,
    monthlyCustomerName: null,
  },
]

const emptyCashState: CashState = {
  session: null,
  movements: [],
  collectedCop: 0,
  voidedCop: 0,
  expectedCop: 0,
  movementCount: 0,
}

const cashCloseSummary: CashCloseSummary = {
  sessionId: 'cash-session-1',
  employeeName: 'Laura Torres',
  openedAt: '2026-08-18T08:00:00.000Z',
  closedAt: '2026-08-18T18:00:00.000Z',
  openingAmountCop: 50_000,
  collectedCop: 10_000,
  voidedCop: 0,
  expectedAmountCop: 60_000,
  closingAmountCop: 60_000,
  differenceCop: 0,
  movementCount: 1,
}

export const employee: Employee = {
  id: 'employee-1',
  fullName: 'Laura Torres',
  documentNumber: '1012345678',
  status: 'active',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
}

const printSettings: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
  printWidthMm: null,
  printOffsetMm: 0,
}

const parkingApi: ParkingApi = {
  getAccessState: vi.fn(async () => ok(accessState)),
  completeOnboarding: vi.fn(async (input) =>
    ok({
      onboardingCompleted: true,
      profile: { name: input.name, address: input.address, phone: input.phone },
      pinConfigured: Boolean(input.pin),
      locked: false,
    }),
  ),
  updateParkingProfile: vi.fn(async (profile) => ok({ ...accessState, profile })),
  unlockWithPin: vi.fn(async () =>
    ok({
      success: true,
      message: 'Acceso permitido.',
      state: accessState,
      retryAfterSeconds: null,
    }),
  ),
  lockApplication: vi.fn(async () => ok({ ...accessState, pinConfigured: true, locked: true })),
  setPin: vi.fn(async () =>
    ok({
      success: true,
      message: 'El PIN local quedó guardado.',
      state: { ...accessState, pinConfigured: true },
      retryAfterSeconds: null,
    }),
  ),
  removePin: vi.fn(async () =>
    ok({
      success: true,
      message: 'El PIN local fue eliminado.',
      state: accessState,
      retryAfterSeconds: null,
    }),
  ),
  getAppStatus: vi.fn(async () =>
    ok({
      name: 'Parking Chía',
      version: '0.1.0-alpha.1',
      isPackaged: false,
      database: {
        connected: true,
        journalMode: 'WAL',
        foreignKeys: true,
        pathLabel: 'Datos locales',
      },
      activeSessions: 0,
    }),
  ),
  getTariffConfiguration: vi.fn(async () => ok(tariffConfiguration)),
  updateTariffSettings: vi.fn(async (input) =>
    ok({
      settings: { ...tariffConfiguration.settings, ...input },
      plans: tariffConfiguration.plans,
    }),
  ),
  createRatePlan: vi.fn(async (input) =>
    ok({
      settings: tariffConfiguration.settings,
      plans: [
        ...tariffConfiguration.plans,
        {
          ...input,
          id: 'rate-new',
          billingUnit: tariffConfiguration.settings.billingUnit,
          createdAt: '2026-08-18T12:00:00.000Z',
          updatedAt: '2026-08-18T12:00:00.000Z',
        },
      ],
    }),
  ),
  updateRatePlan: vi.fn(async (input) =>
    ok({
      settings: tariffConfiguration.settings,
      plans: tariffConfiguration.plans.map((plan) =>
        plan.id === input.id ? { ...plan, ...input } : plan,
      ),
    }),
  ),
  deleteRatePlan: vi.fn(async (input) =>
    ok({
      settings: tariffConfiguration.settings,
      plans: tariffConfiguration.plans.filter((plan) => plan.id !== input.id),
    }),
  ),
  simulateCharge: vi.fn(async (input) =>
    ok(
      calculateChargeForMinutes(input.minutes, tariffConfiguration.settings, {
        amountCop: ratePlan.amountCop,
        minimumChargeCop: ratePlan.minimumChargeCop,
        plenaCop: ratePlan.plenaCop,
        graceMinutes: ratePlan.graceMinutes,
      }),
    ),
  ),
  registerEntry: vi.fn(async (input) =>
    ok({
      sessionId: 'session-new',
      plate: input.plate,
      vehicleType: input.vehicleType,
      ratePlanId: input.ratePlanId,
      ratePlanName: 'Automóvil por hora',
      ratePlanAmountCop: ratePlan.amountCop,
      billingUnit: 'hour' as const,
      enteredAt: new Date().toISOString(),
      graceMinutes: DEFAULT_TARIFF_SETTINGS.graceMinutes,
      employeeName: 'Laura Torres',
      notes: input.notes,
      printed: false,
      printMessage: 'No hay impresoras disponibles en el sistema.',
    }),
  ),
  resolveExitTarget: vi.fn(async () => ok(activeSession)),
  listActiveSessions: vi.fn(async (input) =>
    ok(
      input.search === '' || activeSession.plate.includes(input.search.toUpperCase())
        ? [activeSession]
        : [],
    ),
  ),
  quoteSessionExit: vi.fn(async () =>
    ok({
      session: activeSession,
      charge: chargeNow(),
      quotedAt: new Date().toISOString(),
    }),
  ),
  closeSession: vi.fn(async (input) => {
    const charge = chargeNow()
    return ok({
      sessionId: input.sessionId,
      plate: activeSession.plate,
      vehicleType: activeSession.vehicleType,
      ratePlanName: activeSession.ratePlanName,
      enteredAt: activeSession.enteredAt,
      exitedAt: new Date().toISOString(),
      charge,
      method: input.method,
      receivedCop: input.receivedCop,
      changeCop: calculateChange(charge.totalCop, input.receivedCop),
      receiptNumber: charge.totalCop > 0 ? 1 : null,
      monthlyCoverage: null,
      printed: false,
      printMessage: 'No hay impresoras disponibles en el sistema.',
    })
  }),
  cancelSession: vi.fn(async () => ok([])),
  reprintEntryTicket: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  reprintReceipt: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  listExits: vi.fn(async (input) => {
    const records = exitRecords.filter(
      (record) => input.search === '' || record.plate.includes(input.search.toUpperCase()),
    )
    return ok({
      records,
      totalCount: records.length,
      totalCollectedCop: records.reduce((total, record) => total + record.totalCop, 0),
    })
  }),
  getMonthlyOverview: vi.fn(async (input) =>
    ok({
      ...monthlyOverview,
      subscriptions: monthlyOverview.subscriptions.filter(
        (subscription) =>
          (input.search === '' ||
            subscription.plate.includes(input.search.toUpperCase()) ||
            subscription.customerName.includes(input.search)) &&
          (input.status === 'all' || subscription.status === input.status),
      ),
    }),
  ),
  createMonthlyCustomer: vi.fn(async (input) => ok({ ...monthlyCustomer, ...input })),
  updateMonthlyCustomer: vi.fn(async (input) => ok({ ...monthlyCustomer, ...input })),
  deleteMonthlyCustomer: vi.fn(async () => ok(undefined)),
  createMonthlyPlan: vi.fn(async (input) => ok({ ...monthlyPlan, ...input })),
  updateMonthlyPlan: vi.fn(async (input) => ok({ ...monthlyPlan, ...input })),
  deleteMonthlyPlan: vi.fn(async () => ok(undefined)),
  createSubscription: vi.fn(async () => ok(monthlySubscription)),
  renewSubscription: vi.fn(async () => ok(monthlySubscription)),
  cancelSubscription: vi.fn(async () =>
    ok({ ...monthlySubscription, status: 'cancelled' as const }),
  ),
  registerSubscriptionPayment: vi.fn(async (input) =>
    ok({
      subscriptionId: input.subscriptionId,
      customerName: monthlySubscription.customerName,
      plate: monthlySubscription.plate,
      amountCop: input.amountCop,
      balanceCop: monthlySubscription.amountCop - input.amountCop,
      method: input.method,
      receivedCop: input.receivedCop,
      changeCop: calculateChange(input.amountCop, input.receivedCop),
      receiptNumber: 2,
      printed: false,
      printMessage: 'No hay impresoras disponibles en el sistema.',
    }),
  ),
  reprintSubscriptionReceipt: vi.fn(async () =>
    ok({ printed: false, message: 'No hay impresoras.' }),
  ),
  findMonthlyCoverage: vi.fn(async () => ok(null)),
  getCashState: vi.fn(async () => ok(emptyCashState)),
  openCashSession: vi.fn(async () => ok(emptyCashState)),
  closeCashSession: vi.fn(async () => ok(cashCloseSummary)),
  voidCashPayment: vi.fn(async () => ok(emptyCashState)),
  listCashSessions: vi.fn(async () => ok([])),
  printCashCloseReceipt: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  listEmployees: vi.fn(async () => ok([employee])),
  createEmployee: vi.fn(async (input) => ok({ ...employee, ...input })),
  updateEmployee: vi.fn(async (input) => ok({ ...employee, ...input })),
  deleteEmployee: vi.fn(async () => ok(undefined)),
  getSettings: vi.fn(async () => ok(printSettings)),
  updateSettings: vi.fn(async (input) => ok({ ...printSettings, ...input })),
  listPrinters: vi.fn(async () => ok([])),
  printTestTicket: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  printCalibrationGuide: vi.fn(async () => ok({ printed: false, message: 'No hay impresoras.' })),
  createBackup: vi.fn(async () => ok({ created: false, message: 'Cancelada.' })),
  getUpdateState: vi.fn(async () => ok(updateState)),
  checkForUpdates: vi.fn(async () => ok(updateState)),
  downloadUpdate: vi.fn(async () => ok(updateState)),
  installUpdate: vi.fn(async () => ok(updateState)),
  onUpdateState: vi.fn(() => () => undefined),
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'parkingAPI', { value: parkingApi, configurable: true })
  // Vitest no usa globals, así que la limpieza automática de Testing Library no se registra sola.
  afterEach(cleanup)
}
