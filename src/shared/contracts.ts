import type {
  CashMovementSource,
  CashPaymentStatus,
  CloseCashSessionInput,
  OpenCashSessionInput,
  VoidPaymentInput,
} from './cash'
import type { MonthlyCustomerStatus, SubscriptionPaymentState, SubscriptionStatus } from './monthly'
import type { PaymentMethod } from './parking'
import type {
  ParkingCharge,
  RatePlanBillingUnit,
  RatePlanStatus,
  TariffBillingUnit,
  TariffSettings,
  VehicleType,
} from './tariff'

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: { code: string; message: string } }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type DatabaseStatus = {
  connected: boolean
  journalMode: string
  foreignKeys: boolean
  pathLabel: string
}

export type AppStatus = {
  name: string
  version: string
  isPackaged: boolean
  database: DatabaseStatus
  activeSessions: number
}

export type ParkingProfile = {
  name: string
  address: string
  phone: string
  /** Logo local en PNG, JPEG o WebP; nunca contiene una ruta del sistema. */
  logoDataUrl?: string | null
}

export type AccessState = {
  onboardingCompleted: boolean
  profile: ParkingProfile | null
  pinConfigured: boolean
  locked: boolean
}

export type AccessActionResult = {
  success: boolean
  message: string
  state: AccessState
  retryAfterSeconds: number | null
}

export type RatePlan = {
  id: string
  name: string
  vehicleType: VehicleType
  billingUnit: RatePlanBillingUnit
  /** Precio de una unidad cobrable, en pesos colombianos enteros. */
  amountCop: number
  minimumChargeCop: number
  /** Precio del día completo. `null` desactiva la plena para esta tarifa. */
  plenaCop: number | null
  /** `null` aplica el tiempo de gracia general. */
  graceMinutes: number | null
  status: RatePlanStatus
  createdAt: string
  updatedAt: string
}

export type TariffConfiguration = {
  settings: TariffSettings
  plans: RatePlan[]
}

/** Mensualidad que exime del cobro por tiempo a un vehículo en un instante dado. */
export type MonthlyCoverage = {
  subscriptionId: string
  customerName: string
  startsAt: string
  endsAt: string
}

export type MonthlyCustomer = {
  id: string
  fullName: string
  documentNumber: string | null
  phone: string | null
  email: string | null
  notes: string | null
  status: MonthlyCustomerStatus
  /** Mensualidades vigentes del cliente. */
  activeSubscriptions: number
  /** Mensualidades de cualquier estado; un cliente con historial no se elimina. */
  subscriptionCount: number
  createdAt: string
  updatedAt: string
}

export type MonthlySubscription = {
  id: string
  customerId: string
  customerName: string
  documentNumber: string | null
  vehicleId: string
  plate: string
  vehicleType: VehicleType
  ratePlanId: string
  planName: string
  /** Comienzo del primer día cubierto, en UTC. */
  startsAt: string
  /** Comienzo del día siguiente al último cubierto, en UTC. La cobertura lo excluye. */
  endsAt: string
  /** Costo acordado del periodo, en pesos colombianos enteros. */
  amountCop: number
  paidCop: number
  balanceCop: number
  paymentState: SubscriptionPaymentState
  status: SubscriptionStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type MonthlySummary = {
  activeCount: number
  expiringSoonCount: number
  expiredCount: number
  /** Saldo por cobrar de las mensualidades vigentes y por iniciar. */
  pendingCollectionCop: number
  collectedThisMonthCop: number
}

export type MonthlyOverview = {
  subscriptions: MonthlySubscription[]
  customers: MonthlyCustomer[]
  /** Planes con unidad `month`: el costo mensual disponible para contratar. */
  plans: RatePlan[]
  summary: MonthlySummary
}

export type MonthlyPaymentRegistration = {
  subscriptionId: string
  customerName: string
  plate: string
  amountCop: number
  balanceCop: number
  method: PaymentMethod
  receivedCop: number | null
  changeCop: number | null
  receiptNumber: number
  printed: boolean
  printMessage: string
}

export type ActiveSession = {
  id: string
  plate: string
  vehicleType: VehicleType
  ratePlanId: string | null
  ratePlanName: string | null
  /** Marca de tiempo ISO 8601 en UTC. */
  enteredAt: string
  notes: string | null
  /** Mensualidad vigente de este vehículo ahora mismo; `null` si se cobra por tiempo. */
  monthlyCoverage: MonthlyCoverage | null
}

export type SessionQuote = {
  session: ActiveSession
  /** Cobro calculado en el proceso principal al momento de cotizar. */
  charge: ParkingCharge
  quotedAt: string
}

export type EntryRegistration = {
  sessionId: string
  plate: string
  vehicleType: VehicleType
  ratePlanId: string
  ratePlanName: string
  /** Precio de una unidad de cobro de la tarifa, en pesos colombianos enteros. */
  ratePlanAmountCop: number
  /** Unidad con la que se cobra la tarifa del ingreso (`hour` o `minute`). */
  billingUnit: TariffBillingUnit
  enteredAt: string
  graceMinutes: number
  /** Empleado de la caja que recibió el vehículo. */
  employeeName: string | null
  notes: string | null
  printed: boolean
  printMessage: string
}

export type ExitRegistration = {
  sessionId: string
  plate: string
  vehicleType: VehicleType
  ratePlanName: string | null
  enteredAt: string
  exitedAt: string
  charge: ParkingCharge
  method: PaymentMethod
  receivedCop: number | null
  changeCop: number | null
  receiptNumber: number | null
  /** Mensualidad que cubrió la salida; `null` cuando se cobró por tiempo. */
  monthlyCoverage: MonthlyCoverage | null
  printed: boolean
  printMessage: string
}

export type ExitRecord = {
  sessionId: string
  plate: string
  vehicleType: VehicleType
  ratePlanName: string | null
  enteredAt: string
  exitedAt: string
  totalMinutes: number
  totalCop: number
  status: 'closed' | 'cancelled'
  method: PaymentMethod | null
  receiptNumber: number | null
  /** Desglose guardado al emitir el recibo; `null` cuando la salida no generó cobro. */
  charge: ParkingCharge | null
  /** Nombre del cliente mensual cuando la salida quedó cubierta; `null` en el resto. */
  monthlyCustomerName: string | null
}

export type ExitHistory = {
  records: ExitRecord[]
  /** Total de salidas que cumplen el filtro, aunque la página muestre menos. */
  totalCount: number
  totalCollectedCop: number
}

export type PaperWidth = '58mm' | '80mm'

export type AppSettings = {
  printerName: string | null
  paperWidth: PaperWidth
  showPrintDialog: boolean
}

export type PrinterInfo = {
  name: string
  displayName: string
  isDefault: boolean
  status: number
}

export type PrintResult = {
  printed: boolean
  message: string
}

export type BackupResult = {
  created: boolean
  message: string
}

export type UpdateStateName =
  'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export type UpdateState = {
  status: UpdateStateName
  currentVersion: string
  availableVersion: string | null
  progress: number | null
  message: string
  canCheck: boolean
}

export type RatePlanDraft = Omit<RatePlan, 'id' | 'billingUnit' | 'createdAt' | 'updatedAt'>

export type MonthlyCustomerDraft = Omit<
  MonthlyCustomer,
  'id' | 'activeSubscriptions' | 'subscriptionCount' | 'createdAt' | 'updatedAt'
>

export type MonthlyPlanDraft = {
  name: string
  vehicleType: VehicleType
  /** Costo mensual acordado, en pesos colombianos enteros. */
  amountCop: number
  status: RatePlanStatus
}

export type SubscriptionDraft = {
  customerId: string
  plate: string
  vehicleType: VehicleType
  ratePlanId: string
  /** Primer día cubierto, en calendario local `AAAA-MM-DD`. */
  startDate: string
  /** Último día cubierto, en calendario local `AAAA-MM-DD`. */
  endDate: string
  amountCop: number
  notes: string | null
}

export type MonthlyFilters = {
  search: string
  status: 'all' | SubscriptionStatus
}

export type Employee = {
  id: string
  fullName: string
  documentNumber: string | null
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type EmployeeDraft = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>

export type CashSession = {
  id: string
  employeeId: string | null
  employeeName: string | null
  openedAt: string
  closedAt: string | null
  openingAmountCop: number
  closingAmountCop: number | null
  expectedAmountCop: number | null
  status: 'open' | 'closed'
  notes: string | null
}

export type CashMovement = {
  paymentId: string
  receiptNumber: number | null
  paidAt: string
  amountCop: number
  method: PaymentMethod
  status: CashPaymentStatus
  source: CashMovementSource
  plate: string | null
  customerName: string | null
  reference: string | null
}

export type CashState = {
  /** Caja abierta ahora mismo; `null` cuando el turno no ha iniciado. */
  session: CashSession | null
  movements: CashMovement[]
  collectedCop: number
  voidedCop: number
  expectedCop: number
  movementCount: number
}

export type CashCloseSummary = {
  sessionId: string
  employeeName: string | null
  openedAt: string
  closedAt: string
  openingAmountCop: number
  collectedCop: number
  voidedCop: number
  expectedAmountCop: number
  closingAmountCop: number
  /** `closingAmountCop - expectedAmountCop`: positivo sobra, negativo falta. */
  differenceCop: number
  movementCount: number
}

export interface ParkingApi {
  getAccessState: () => Promise<ApiResult<AccessState>>
  completeOnboarding: (input: {
    name: string
    address: string
    phone: string
    pin: string
  }) => Promise<ApiResult<AccessState>>
  updateParkingProfile: (input: ParkingProfile) => Promise<ApiResult<AccessState>>
  unlockWithPin: (input: { pin: string }) => Promise<ApiResult<AccessActionResult>>
  lockApplication: () => Promise<ApiResult<AccessState>>
  setPin: (input: { currentPin?: string; newPin: string }) => Promise<ApiResult<AccessActionResult>>
  removePin: (input: { currentPin: string }) => Promise<ApiResult<AccessActionResult>>
  getAppStatus: () => Promise<ApiResult<AppStatus>>
  getTariffConfiguration: () => Promise<ApiResult<TariffConfiguration>>
  updateTariffSettings: (
    input: Partial<Omit<TariffSettings, 'currency'>>,
  ) => Promise<ApiResult<TariffConfiguration>>
  createRatePlan: (input: RatePlanDraft) => Promise<ApiResult<TariffConfiguration>>
  updateRatePlan: (input: RatePlanDraft & { id: string }) => Promise<ApiResult<TariffConfiguration>>
  deleteRatePlan: (input: { id: string }) => Promise<ApiResult<TariffConfiguration>>
  simulateCharge: (input: {
    ratePlanId: string
    minutes: number
  }) => Promise<ApiResult<ParkingCharge>>
  registerEntry: (input: {
    plate: string
    vehicleType: VehicleType
    ratePlanId: string
    notes: string | null
  }) => Promise<ApiResult<EntryRegistration>>
  resolveExitTarget: (input: { code: string }) => Promise<ApiResult<ActiveSession>>
  listActiveSessions: (input: { search: string }) => Promise<ApiResult<ActiveSession[]>>
  quoteSessionExit: (input: { sessionId: string }) => Promise<ApiResult<SessionQuote>>
  closeSession: (input: {
    sessionId: string
    expectedTotalCop: number
    method: PaymentMethod
    receivedCop: number | null
    notes: string | null
  }) => Promise<ApiResult<ExitRegistration>>
  cancelSession: (input: {
    sessionId: string
    reason: string
  }) => Promise<ApiResult<ActiveSession[]>>
  reprintEntryTicket: (input: { sessionId: string }) => Promise<ApiResult<PrintResult>>
  reprintReceipt: (input: { sessionId: string }) => Promise<ApiResult<PrintResult>>
  listExits: (input: {
    search: string
    from: string
    to: string
    limit: number
  }) => Promise<ApiResult<ExitHistory>>
  getMonthlyOverview: (input: MonthlyFilters) => Promise<ApiResult<MonthlyOverview>>
  createMonthlyCustomer: (input: MonthlyCustomerDraft) => Promise<ApiResult<MonthlyCustomer>>
  updateMonthlyCustomer: (
    input: MonthlyCustomerDraft & { id: string },
  ) => Promise<ApiResult<MonthlyCustomer>>
  deleteMonthlyCustomer: (input: { id: string }) => Promise<ApiResult<void>>
  createMonthlyPlan: (input: MonthlyPlanDraft) => Promise<ApiResult<RatePlan>>
  updateMonthlyPlan: (input: MonthlyPlanDraft & { id: string }) => Promise<ApiResult<RatePlan>>
  deleteMonthlyPlan: (input: { id: string }) => Promise<ApiResult<void>>
  createSubscription: (input: SubscriptionDraft) => Promise<ApiResult<MonthlySubscription>>
  renewSubscription: (input: {
    id: string
    months: number
    amountCop: number | null
  }) => Promise<ApiResult<MonthlySubscription>>
  cancelSubscription: (input: {
    id: string
    reason: string
  }) => Promise<ApiResult<MonthlySubscription>>
  registerSubscriptionPayment: (input: {
    subscriptionId: string
    amountCop: number
    method: PaymentMethod
    receivedCop: number | null
    reference: string | null
  }) => Promise<ApiResult<MonthlyPaymentRegistration>>
  reprintSubscriptionReceipt: (input: { subscriptionId: string }) => Promise<ApiResult<PrintResult>>
  findMonthlyCoverage: (input: { plate: string }) => Promise<ApiResult<MonthlyCoverage | null>>
  getCashState: () => Promise<ApiResult<CashState>>
  openCashSession: (input: OpenCashSessionInput) => Promise<ApiResult<CashState>>
  closeCashSession: (input: CloseCashSessionInput) => Promise<ApiResult<CashCloseSummary>>
  voidCashPayment: (input: VoidPaymentInput) => Promise<ApiResult<CashState>>
  listCashSessions: () => Promise<ApiResult<CashCloseSummary[]>>
  printCashCloseReceipt: (input: { sessionId: string }) => Promise<ApiResult<PrintResult>>
  listEmployees: () => Promise<ApiResult<Employee[]>>
  createEmployee: (input: EmployeeDraft) => Promise<ApiResult<Employee>>
  updateEmployee: (input: EmployeeDraft & { id: string }) => Promise<ApiResult<Employee>>
  deleteEmployee: (input: { id: string }) => Promise<ApiResult<void>>
  getSettings: () => Promise<ApiResult<AppSettings>>
  updateSettings: (input: Partial<AppSettings>) => Promise<ApiResult<AppSettings>>
  listPrinters: () => Promise<ApiResult<PrinterInfo[]>>
  printTestTicket: () => Promise<ApiResult<PrintResult>>
  createBackup: () => Promise<ApiResult<BackupResult>>
  getUpdateState: () => Promise<ApiResult<UpdateState>>
  checkForUpdates: () => Promise<ApiResult<UpdateState>>
  downloadUpdate: () => Promise<ApiResult<UpdateState>>
  installUpdate: () => Promise<ApiResult<void>>
  onUpdateState: (listener: (state: UpdateState) => void) => () => void
}
