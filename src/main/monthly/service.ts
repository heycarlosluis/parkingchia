import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  MonthlyCoverage,
  MonthlyCustomer,
  MonthlyOverview,
  MonthlyPaymentRegistration,
  MonthlySubscription,
  MonthlySummary,
  RatePlan,
} from '@shared/contracts'
import {
  coverageEndDate,
  deriveSubscriptionStatus,
  EXPIRING_SOON_DAYS,
  lastCoveredLocalDate,
  MILLISECONDS_PER_DAY,
  resolvePaymentState,
  shiftLocalDate,
  startOfLocalDayUtc,
  todayLocalDate,
  type CancelSubscriptionInput,
  type CreateMonthlyCustomerInput,
  type CreateMonthlyPlanInput,
  type CreateSubscriptionInput,
  type ListMonthlyInput,
  type RegisterSubscriptionPaymentInput,
  type RenewSubscriptionInput,
  type SubscriptionStatus,
  type UpdateMonthlyCustomerInput,
  type UpdateMonthlyPlanInput,
} from '@shared/monthly'
import { calculateChange, type PaymentMethod } from '@shared/parking'
import type { VehicleType } from '@shared/tariff'
import { OperationError } from '@main/ipc/errors'
import type { CashService } from '@main/cash/service'

export const MONTHLY_RECEIPT_SNAPSHOT_VERSION = 1

/** Comprobante inmutable de un pago de mensualidad; se guarda tal cual se emitió. */
export type MonthlyReceiptSnapshot = {
  version: number
  receiptNumber: number
  issuedAt: string
  customerName: string
  documentNumber: string | null
  plate: string
  vehicleType: VehicleType
  planName: string
  startsAt: string
  endsAt: string
  /** Costo total del periodo. */
  amountCop: number
  /** Importe de este pago. */
  paidCop: number
  /** Saldo pendiente después de este pago. */
  balanceCop: number
  method: PaymentMethod
  receivedCop: number | null
  changeCop: number | null
  reference: string | null
}

type CustomerRow = {
  id: string
  full_name: string
  document_number: string | null
  phone: string | null
  email: string | null
  notes: string | null
  status: MonthlyCustomer['status']
  created_at: string
  updated_at: string
  active_subscriptions: number
  subscription_count: number
}

type SubscriptionRow = {
  id: string
  customer_id: string
  customer_name: string
  document_number: string | null
  vehicle_id: string
  plate: string
  vehicle_type: VehicleType
  rate_plan_id: string
  plan_name: string
  starts_at: string
  ends_at: string
  amount_cop: number
  status: SubscriptionStatus
  notes: string | null
  paid_cop: number
  created_at: string
  updated_at: string
}

type PlanRow = {
  id: string
  name: string
  vehicle_type: VehicleType
  billing_unit: RatePlan['billingUnit']
  amount_cop: number
  minimum_charge_cop: number
  plena_cop: number | null
  grace_minutes: number | null
  status: RatePlan['status']
  created_at: string
  updated_at: string
}

const SUBSCRIPTION_QUERY = `
  SELECT s.id, s.customer_id, c.full_name AS customer_name, c.document_number,
         s.vehicle_id, v.plate, v.vehicle_type, s.rate_plan_id, r.name AS plan_name,
         s.starts_at, s.ends_at, s.amount_cop, s.status, s.notes,
         s.created_at, s.updated_at,
         COALESCE((
           SELECT SUM(p.amount_cop) FROM payments p
           WHERE p.subscription_id = s.id AND p.status = 'completed'
         ), 0) AS paid_cop
  FROM monthly_subscriptions s
  JOIN monthly_customers c ON c.id = s.customer_id
  JOIN vehicles v ON v.id = s.vehicle_id
  JOIN rate_plans r ON r.id = s.rate_plan_id
`

/** Vigentes primero, luego las que están por iniciar, las vencidas y las canceladas. */
const SUBSCRIPTION_ORDER = `
  ORDER BY CASE s.status
             WHEN 'active' THEN 0
             WHEN 'pending' THEN 1
             WHEN 'expired' THEN 2
             ELSE 3
           END,
           CASE WHEN s.status IN ('active', 'pending') THEN s.ends_at END ASC,
           s.ends_at DESC
`

export class MonthlyService {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly cash: CashService,
  ) {}

  /**
   * Estado completo del módulo con los filtros aplicados a las suscripciones.
   *
   * Antes de leer se sincronizan los estados derivados del calendario, para que
   * una mensualidad vencida durante la noche aparezca vencida al abrir la app.
   */
  getOverview(input: ListMonthlyInput): MonthlyOverview {
    const now = new Date().toISOString()
    this.refreshStatuses(now)
    return {
      subscriptions: this.listSubscriptions(input, now),
      customers: this.listCustomers(),
      plans: this.listPlans(),
      summary: this.buildSummary(now),
    }
  }

  // ---------------------------------------------------------------- clientes

  listCustomers(): MonthlyCustomer[] {
    const rows = this.sqlite
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END), 0) AS active_subscriptions,
                COUNT(s.id) AS subscription_count
         FROM monthly_customers c
         LEFT JOIN monthly_subscriptions s ON s.customer_id = c.id
         GROUP BY c.id
         ORDER BY c.status = 'inactive', c.full_name COLLATE NOCASE`,
      )
      .all() as CustomerRow[]
    return rows.map((row) => this.toCustomer(row))
  }

  createCustomer(input: CreateMonthlyCustomerInput): MonthlyCustomer {
    this.assertDocumentAvailable(input.documentNumber, null)
    const id = randomUUID()
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO monthly_customers
           (id, full_name, document_number, phone, email, notes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.fullName,
          input.documentNumber,
          input.phone,
          input.email,
          input.notes,
          input.status,
          now,
          now,
        )
      this.writeAudit('monthly.customer_created', 'monthly_customer', id, now, {
        fullName: input.fullName,
      })
    })()

    return this.requireCustomer(id)
  }

  updateCustomer(input: UpdateMonthlyCustomerInput): MonthlyCustomer {
    this.requireCustomer(input.id)
    this.assertDocumentAvailable(input.documentNumber, input.id)
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE monthly_customers
           SET full_name = ?, document_number = ?, phone = ?, email = ?, notes = ?,
               status = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.fullName,
          input.documentNumber,
          input.phone,
          input.email,
          input.notes,
          input.status,
          now,
          input.id,
        )
      this.writeAudit('monthly.customer_updated', 'monthly_customer', input.id, now, {
        fullName: input.fullName,
        status: input.status,
      })
    })()

    return this.requireCustomer(input.id)
  }

  deleteCustomer(id: string): void {
    const customer = this.requireCustomer(id)
    if (customer.subscriptionCount > 0) {
      throw new OperationError(
        'CUSTOMER_IN_USE',
        'Este cliente ya tiene mensualidades registradas. Márcalo como inactivo en lugar de eliminarlo.',
      )
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM monthly_customers WHERE id = ?').run(id)
      this.writeAudit('monthly.customer_deleted', 'monthly_customer', id, now, {
        fullName: customer.fullName,
      })
    })()
  }

  // ------------------------------------------------------- planes mensuales

  /** Tarifas con unidad `month`: el costo mensual que se le ofrece al cliente. */
  listPlans(): RatePlan[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM rate_plans
         WHERE billing_unit = 'month'
         ORDER BY status = 'inactive', vehicle_type, name COLLATE NOCASE`,
      )
      .all() as PlanRow[]
    return rows.map((row) => this.toPlan(row))
  }

  createPlan(input: CreateMonthlyPlanInput): RatePlan {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO rate_plans
           (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop,
            plena_cop, grace_minutes, status, created_at, updated_at)
           VALUES (?, ?, ?, 'month', ?, 0, NULL, NULL, ?, ?, ?)`,
        )
        .run(id, input.name, input.vehicleType, input.amountCop, input.status, now, now)
      this.writeAudit('monthly.plan_created', 'rate_plan', id, now, {
        name: input.name,
        amountCop: input.amountCop,
      })
    })()

    return this.requirePlan(id)
  }

  updatePlan(input: UpdateMonthlyPlanInput): RatePlan {
    this.requirePlan(input.id)
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE rate_plans
           SET name = ?, vehicle_type = ?, amount_cop = ?, status = ?, updated_at = ?
           WHERE id = ? AND billing_unit = 'month'`,
        )
        .run(input.name, input.vehicleType, input.amountCop, input.status, now, input.id)
      this.writeAudit('monthly.plan_updated', 'rate_plan', input.id, now, {
        name: input.name,
        amountCop: input.amountCop,
      })
    })()

    return this.requirePlan(input.id)
  }

  deletePlan(id: string): void {
    const plan = this.requirePlan(id)
    const references = this.sqlite
      .prepare('SELECT count(*) AS total FROM monthly_subscriptions WHERE rate_plan_id = ?')
      .get(id) as { total: number }
    if (references.total > 0) {
      throw new OperationError(
        'MONTHLY_PLAN_IN_USE',
        'Este plan ya se usó en una mensualidad. Desactívalo en lugar de eliminarlo.',
      )
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite.prepare("DELETE FROM rate_plans WHERE id = ? AND billing_unit = 'month'").run(id)
      this.writeAudit('monthly.plan_deleted', 'rate_plan', id, now, { name: plan.name })
    })()
  }

  // ----------------------------------------------------------- suscripciones

  listSubscriptions(input: ListMonthlyInput, nowUtc: string): MonthlySubscription[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (input.search !== '') {
      conditions.push('(v.plate LIKE ? OR c.full_name LIKE ? OR c.document_number LIKE ?)')
      const plate = `%${input.search.toUpperCase()}%`
      const text = `%${input.search}%`
      params.push(plate, text, text)
    }
    if (input.status !== 'all') {
      conditions.push('s.status = ?')
      params.push(input.status)
    }

    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
    const rows = this.sqlite
      .prepare(`${SUBSCRIPTION_QUERY} ${where} ${SUBSCRIPTION_ORDER}`)
      .all(...params) as SubscriptionRow[]
    return rows.map((row) => this.toSubscription(row, nowUtc))
  }

  createSubscription(input: CreateSubscriptionInput): MonthlySubscription {
    const customer = this.requireCustomer(input.customerId)
    if (customer.status !== 'active') {
      throw new OperationError(
        'CUSTOMER_INACTIVE',
        'Ese cliente está inactivo. Actívalo antes de crearle una mensualidad.',
      )
    }

    const plan = this.requirePlan(input.ratePlanId)
    if (plan.status !== 'active') {
      throw new OperationError(
        'MONTHLY_PLAN_INACTIVE',
        'Ese plan mensual está inactivo. Actívalo o elige otro.',
      )
    }

    const startsAt = startOfLocalDayUtc(input.startDate)
    const endsAt = startOfLocalDayUtc(input.endDate, 1)
    const now = new Date().toISOString()
    const id = randomUUID()

    this.sqlite.transaction(() => {
      const vehicleId = this.resolveVehicle(input.plate, input.vehicleType, now)
      this.assertNoOverlap(vehicleId, startsAt, endsAt, null)

      this.sqlite
        .prepare(
          `INSERT INTO monthly_subscriptions
           (id, customer_id, vehicle_id, rate_plan_id, starts_at, ends_at, amount_cop,
            status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.customerId,
          vehicleId,
          input.ratePlanId,
          startsAt,
          endsAt,
          input.amountCop,
          deriveSubscriptionStatus({ startsAt, endsAt, cancelled: false, nowUtc: now }),
          input.notes,
          now,
          now,
        )

      this.writeAudit('monthly.subscription_created', 'monthly_subscription', id, now, {
        customerId: input.customerId,
        plate: input.plate,
        startsAt,
        endsAt,
        amountCop: input.amountCop,
      })
    })()

    return this.requireSubscription(id, now)
  }

  /**
   * Abre un periodo nuevo a continuación del actual.
   *
   * Renovar no modifica el periodo anterior ni sus pagos: crea una mensualidad
   * nueva que empieza el día siguiente al último cubierto, o el día de hoy si
   * la anterior ya venció.
   */
  renewSubscription(input: RenewSubscriptionInput): MonthlySubscription {
    const now = new Date().toISOString()
    const current = this.requireSubscription(input.id, now)
    if (current.status === 'cancelled') {
      throw new OperationError(
        'SUBSCRIPTION_CANCELLED',
        'Esa mensualidad está cancelada. Crea una nueva para este cliente.',
      )
    }

    const today = todayLocalDate(now)
    const dayAfterCurrent = shiftLocalDate(lastCoveredLocalDate(current.endsAt), 1)
    const startDate = dayAfterCurrent > today ? dayAfterCurrent : today
    const endDate = coverageEndDate(startDate, input.months)

    return this.createSubscription({
      customerId: current.customerId,
      plate: current.plate,
      vehicleType: current.vehicleType,
      ratePlanId: current.ratePlanId,
      startDate,
      endDate,
      amountCop: input.amountCop ?? current.amountCop,
      notes: current.notes,
    })
  }

  cancelSubscription(input: CancelSubscriptionInput): MonthlySubscription {
    const now = new Date().toISOString()
    const current = this.requireSubscription(input.id, now)
    if (current.status === 'cancelled') {
      throw new OperationError('SUBSCRIPTION_CANCELLED', 'Esa mensualidad ya está cancelada.')
    }

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          "UPDATE monthly_subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?",
        )
        .run(now, input.id)
      this.writeAudit('monthly.subscription_cancelled', 'monthly_subscription', input.id, now, {
        plate: current.plate,
        customerName: current.customerName,
        reason: input.reason,
        paidCop: current.paidCop,
      })
    })()

    return this.requireSubscription(input.id, now)
  }

  // ------------------------------------------------------------------ pagos

  registerPayment(input: RegisterSubscriptionPaymentInput): MonthlyPaymentRegistration {
    const now = new Date().toISOString()
    const subscription = this.requireSubscription(input.subscriptionId, now)

    if (subscription.status === 'cancelled') {
      throw new OperationError(
        'SUBSCRIPTION_CANCELLED',
        'No se registran pagos sobre una mensualidad cancelada.',
      )
    }
    if (subscription.balanceCop <= 0) {
      throw new OperationError(
        'SUBSCRIPTION_ALREADY_PAID',
        'Esta mensualidad ya está pagada por completo.',
      )
    }
    if (input.amountCop > subscription.balanceCop) {
      throw new OperationError(
        'PAYMENT_ABOVE_BALANCE',
        'El pago supera el saldo pendiente de la mensualidad. Registra como máximo el saldo.',
      )
    }
    const cashSessionId = this.cash.getOpenSessionId()
    if (cashSessionId === null) {
      throw new OperationError(
        'NO_CASH_SESSION',
        'Abre la caja antes de registrar un pago de mensualidad.',
      )
    }

    const receivedCop = input.method === 'cash' ? input.receivedCop : null
    if (input.method === 'cash' && (receivedCop === null || receivedCop < input.amountCop)) {
      throw new OperationError(
        'INSUFFICIENT_CASH',
        'Registra el efectivo recibido y que cubra el pago.',
      )
    }
    const changeCop = calculateChange(input.amountCop, receivedCop)
    const balanceCop = subscription.balanceCop - input.amountCop

    let receiptNumber = 0

    this.sqlite.transaction(() => {
      const paymentId = randomUUID()
      this.sqlite
        .prepare(
          `INSERT INTO payments
           (id, subscription_id, cash_register_session_id, amount_cop, method, status, paid_at,
            reference, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
        )
        .run(
          paymentId,
          input.subscriptionId,
          cashSessionId,
          input.amountCop,
          input.method,
          now,
          input.reference,
          now,
          now,
        )

      const next = this.sqlite
        .prepare('SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next FROM receipts')
        .get() as { next: number }
      receiptNumber = next.next

      const snapshot: MonthlyReceiptSnapshot = {
        version: MONTHLY_RECEIPT_SNAPSHOT_VERSION,
        receiptNumber,
        issuedAt: now,
        customerName: subscription.customerName,
        documentNumber: subscription.documentNumber,
        plate: subscription.plate,
        vehicleType: subscription.vehicleType,
        planName: subscription.planName,
        startsAt: subscription.startsAt,
        endsAt: subscription.endsAt,
        amountCop: subscription.amountCop,
        paidCop: input.amountCop,
        balanceCop,
        method: input.method,
        receivedCop,
        changeCop,
        reference: input.reference,
      }

      this.sqlite
        .prepare(
          `INSERT INTO receipts
           (id, receipt_number, payment_id, issued_at, status, snapshot_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)`,
        )
        .run(randomUUID(), receiptNumber, paymentId, now, JSON.stringify(snapshot), now, now)

      this.writeAudit(
        'monthly.payment_registered',
        'monthly_subscription',
        input.subscriptionId,
        now,
        {
          paymentId,
          amountCop: input.amountCop,
          method: input.method,
          receiptNumber,
          balanceCop,
        },
      )
    })()

    return {
      subscriptionId: input.subscriptionId,
      customerName: subscription.customerName,
      plate: subscription.plate,
      amountCop: input.amountCop,
      balanceCop,
      method: input.method,
      receivedCop,
      changeCop,
      receiptNumber,
      printed: false,
      printMessage: '',
    }
  }

  /** Recupera el comprobante emitido para reimprimirlo sin recalcular nada. */
  findReceiptSnapshot(subscriptionId: string): MonthlyReceiptSnapshot {
    const row = this.sqlite
      .prepare(
        `SELECT r.snapshot_json FROM receipts r
         JOIN payments p ON p.id = r.payment_id
         WHERE p.subscription_id = ? AND r.status = 'issued'
         ORDER BY r.receipt_number DESC LIMIT 1`,
      )
      .get(subscriptionId) as { snapshot_json: string } | undefined
    if (!row) {
      throw new OperationError(
        'RECEIPT_NOT_FOUND',
        'Esta mensualidad todavía no tiene pagos con comprobante.',
      )
    }
    return JSON.parse(row.snapshot_json) as MonthlyReceiptSnapshot
  }

  // -------------------------------------------------------------- cobertura

  /**
   * Mensualidad que cubre a un vehículo en un instante dado.
   *
   * Se consulta por fechas y no por el estado guardado, para que la exención
   * no dependa de que la sincronización de estados haya corrido antes.
   */
  findCoverageForVehicle(vehicleId: string, atUtc: string): MonthlyCoverage | null {
    const row = this.sqlite
      .prepare(
        `SELECT s.id, c.full_name, s.starts_at, s.ends_at
         FROM monthly_subscriptions s
         JOIN monthly_customers c ON c.id = s.customer_id
         WHERE s.vehicle_id = ? AND s.status <> 'cancelled'
           AND s.starts_at <= ? AND s.ends_at > ?
         ORDER BY s.ends_at DESC LIMIT 1`,
      )
      .get(vehicleId, atUtc, atUtc) as
      { id: string; full_name: string; starts_at: string; ends_at: string } | undefined
    if (!row) return null
    return {
      subscriptionId: row.id,
      customerName: row.full_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }
  }

  /**
   * Mensualidad que cubre una matrícula en un instante dado.
   *
   * Útil en el ingreso: permite avisar que un vehículo es cliente mensual antes
   * de registrar la sesión. La matrícula debe llegar ya normalizada.
   */
  findCoverageByPlate(
    plate: string,
    atUtc: string = new Date().toISOString(),
  ): MonthlyCoverage | null {
    const row = this.sqlite
      .prepare(
        `SELECT s.id, c.full_name, s.starts_at, s.ends_at
         FROM monthly_subscriptions s
         JOIN monthly_customers c ON c.id = s.customer_id
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE v.plate = ? AND s.status <> 'cancelled'
           AND s.starts_at <= ? AND s.ends_at > ?
         ORDER BY s.ends_at DESC LIMIT 1`,
      )
      .get(plate, atUtc, atUtc) as
      { id: string; full_name: string; starts_at: string; ends_at: string } | undefined
    if (!row) return null
    return {
      subscriptionId: row.id,
      customerName: row.full_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }
  }

  // ------------------------------------------------------------- internos

  /** Alinea el estado guardado con el calendario; la cancelación nunca se toca. */
  refreshStatuses(nowUtc: string): void {
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE monthly_subscriptions SET status = 'pending', updated_at = ?
           WHERE status NOT IN ('cancelled', 'pending') AND starts_at > ?`,
        )
        .run(nowUtc, nowUtc)
      this.sqlite
        .prepare(
          `UPDATE monthly_subscriptions SET status = 'active', updated_at = ?
           WHERE status NOT IN ('cancelled', 'active') AND starts_at <= ? AND ends_at > ?`,
        )
        .run(nowUtc, nowUtc, nowUtc)
      this.sqlite
        .prepare(
          `UPDATE monthly_subscriptions SET status = 'expired', updated_at = ?
           WHERE status NOT IN ('cancelled', 'expired') AND ends_at <= ?`,
        )
        .run(nowUtc, nowUtc)
    })()
  }

  private buildSummary(nowUtc: string): MonthlySummary {
    const soonLimit = new Date(
      Date.parse(nowUtc) + EXPIRING_SOON_DAYS * MILLISECONDS_PER_DAY,
    ).toISOString()
    const monthStart = startOfLocalDayUtc(`${todayLocalDate(nowUtc).slice(0, 7)}-01`)

    const counts = this.sqlite
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_count,
           COALESCE(SUM(CASE WHEN status = 'active' AND ends_at <= ? THEN 1 ELSE 0 END), 0) AS expiring_count,
           COALESCE(SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END), 0) AS expired_count
         FROM monthly_subscriptions`,
      )
      .get(soonLimit) as { active_count: number; expiring_count: number; expired_count: number }

    const pending = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(MAX(pending, 0)), 0) AS total FROM (
           SELECT s.amount_cop - COALESCE((
             SELECT SUM(p.amount_cop) FROM payments p
             WHERE p.subscription_id = s.id AND p.status = 'completed'
           ), 0) AS pending
           FROM monthly_subscriptions s
           WHERE s.status IN ('active', 'pending')
         )`,
      )
      .get() as { total: number }

    const collected = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(p.amount_cop), 0) AS total FROM payments p
         WHERE p.subscription_id IS NOT NULL AND p.status = 'completed' AND p.paid_at >= ?`,
      )
      .get(monthStart) as { total: number }

    return {
      activeCount: counts.active_count,
      expiringSoonCount: counts.expiring_count,
      expiredCount: counts.expired_count,
      pendingCollectionCop: pending.total,
      collectedThisMonthCop: collected.total,
    }
  }

  /** Reutiliza el vehículo de la matrícula o lo crea; es el mismo que usa el parqueo. */
  private resolveVehicle(plate: string, vehicleType: VehicleType, now: string): string {
    const existing = this.sqlite.prepare('SELECT id FROM vehicles WHERE plate = ?').get(plate) as
      { id: string } | undefined
    if (existing) {
      this.sqlite
        .prepare('UPDATE vehicles SET vehicle_type = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(vehicleType, 'active', now, existing.id)
      return existing.id
    }

    const id = randomUUID()
    this.sqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(id, plate, vehicleType, now, now)
    return id
  }

  private assertNoOverlap(
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    excludeId: string | null,
  ): void {
    const row = this.sqlite
      .prepare(
        `SELECT s.id, s.starts_at, s.ends_at, v.plate
         FROM monthly_subscriptions s
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.vehicle_id = ? AND s.status <> 'cancelled'
           AND s.starts_at < ? AND s.ends_at > ?
           AND (? IS NULL OR s.id <> ?)
         LIMIT 1`,
      )
      .get(vehicleId, endsAt, startsAt, excludeId, excludeId) as
      { id: string; starts_at: string; ends_at: string; plate: string } | undefined
    if (row) {
      throw new OperationError(
        'SUBSCRIPTION_OVERLAPS',
        `La matrícula ${row.plate} ya tiene una mensualidad vigente hasta el ${lastCoveredLocalDate(row.ends_at)}. Renuévala en lugar de crear otra.`,
      )
    }
  }

  private assertDocumentAvailable(documentNumber: string | null, excludeId: string | null): void {
    if (documentNumber === null) return
    const row = this.sqlite
      .prepare(
        `SELECT id FROM monthly_customers
         WHERE document_number = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
      )
      .get(documentNumber, excludeId, excludeId) as { id: string } | undefined
    if (row) {
      throw new OperationError(
        'DOCUMENT_ALREADY_USED',
        'Ya existe un cliente con ese número de documento.',
      )
    }
  }

  private requireCustomer(id: string): MonthlyCustomer {
    const row = this.sqlite
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END), 0) AS active_subscriptions,
                COUNT(s.id) AS subscription_count
         FROM monthly_customers c
         LEFT JOIN monthly_subscriptions s ON s.customer_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`,
      )
      .get(id) as CustomerRow | undefined
    if (!row) {
      throw new OperationError('CUSTOMER_NOT_FOUND', 'Ese cliente mensual ya no existe.')
    }
    return this.toCustomer(row)
  }

  private requirePlan(id: string): RatePlan {
    const row = this.sqlite
      .prepare("SELECT * FROM rate_plans WHERE id = ? AND billing_unit = 'month'")
      .get(id) as PlanRow | undefined
    if (!row) {
      throw new OperationError('MONTHLY_PLAN_NOT_FOUND', 'Ese plan mensual ya no existe.')
    }
    return this.toPlan(row)
  }

  private requireSubscription(id: string, nowUtc: string): MonthlySubscription {
    const row = this.sqlite.prepare(`${SUBSCRIPTION_QUERY} WHERE s.id = ?`).get(id) as
      SubscriptionRow | undefined
    if (!row) {
      throw new OperationError('SUBSCRIPTION_NOT_FOUND', 'Esa mensualidad ya no existe.')
    }
    return this.toSubscription(row, nowUtc)
  }

  private toCustomer(row: CustomerRow): MonthlyCustomer {
    return {
      id: row.id,
      fullName: row.full_name,
      documentNumber: row.document_number,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      status: row.status,
      activeSubscriptions: row.active_subscriptions,
      subscriptionCount: row.subscription_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private toPlan(row: PlanRow): RatePlan {
    return {
      id: row.id,
      name: row.name,
      vehicleType: row.vehicle_type,
      billingUnit: row.billing_unit,
      amountCop: row.amount_cop,
      minimumChargeCop: row.minimum_charge_cop,
      plenaCop: row.plena_cop,
      graceMinutes: row.grace_minutes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private toSubscription(row: SubscriptionRow, nowUtc: string): MonthlySubscription {
    const status = deriveSubscriptionStatus({
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      cancelled: row.status === 'cancelled',
      nowUtc,
    })
    const balanceCop = Math.max(row.amount_cop - row.paid_cop, 0)
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      documentNumber: row.document_number,
      vehicleId: row.vehicle_id,
      plate: row.plate,
      vehicleType: row.vehicle_type,
      ratePlanId: row.rate_plan_id,
      planName: row.plan_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      amountCop: row.amount_cop,
      paidCop: row.paid_cop,
      balanceCop,
      paymentState: resolvePaymentState(row.amount_cop, row.paid_cop),
      status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private writeAudit(
    action: string,
    entityType: string,
    entityId: string,
    createdAt: string,
    details: Record<string, unknown>,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, actor, details_json, created_at)
         VALUES (?, ?, ?, ?, 'local-operator', ?, ?)`,
      )
      .run(randomUUID(), action, entityType, entityId, JSON.stringify(details), createdAt)
  }
}
