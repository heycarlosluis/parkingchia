import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  ActiveSession,
  EntryRegistration,
  ExitHistory,
  ExitRecord,
  ExitRegistration,
  MonthlyCoverage,
  SessionQuote,
} from '@shared/contracts'
import {
  calculateChange,
  type CancelSessionInput,
  type CloseSessionInput,
  type ListActiveSessionsInput,
  type ListExitsInput,
  type PaymentMethod,
  type RegisterEntryInput,
} from '@shared/parking'
import {
  calculateChargeForMinutes,
  type ParkingCharge,
  type RatePlanBillingUnit,
  type RatePlanPricing,
  type TariffBillingUnit,
  type VehicleType,
} from '@shared/tariff'
import { elapsedMinutes, elapsedMinutesOrZero } from '@shared/format'
import {
  decodeEntryTicketCode,
  entryTicketPayloadSchema,
  ENTRY_TICKET_VERSION,
  isEntryTicketCode,
  type EntryTicketPayload,
} from '@shared/entry-ticket'
import { normalizePlate, plateSchema } from '@shared/validation'
import { OperationError } from '@main/ipc/errors'
import type { CashService } from '@main/cash/service'
import type { MonthlyService } from '@main/monthly/service'
import type { TariffService } from '@main/tariffs/service'

/**
 * Precio nulo que se aplica cuando una mensualidad cubre la permanencia.
 *
 * Conserva el tiempo del desglose para que el operador siga viendo cuánto
 * estuvo el vehículo, pero deja el total en cero.
 */
const COVERED_BY_MONTHLY_PRICING: RatePlanPricing = {
  amountCop: 0,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
}

export const RECEIPT_SNAPSHOT_VERSION = 3

export type ReceiptSnapshot = {
  version: number
  receiptNumber: number
  issuedAt: string
  plate: string
  vehicleType: VehicleType
  ratePlanName: string | null
  enteredAt: string
  exitedAt: string
  charge: ParkingCharge
  method: CloseSessionInput['method']
  receivedCop: number | null
  changeCop: number | null
  /** Empleado del turno que cobró la salida; `null` en recibos anteriores a la v3. */
  employeeName: string | null
  notes: string | null
}

/**
 * Completa un recibo antiguo con los campos que agregaron la plena y el turno.
 *
 * Los recibos versión 1 se emitieron sin plenas: todas sus unidades eran horas
 * o minutos sueltos, así que reimprimirlos debe seguir mostrando lo cobrado.
 * Los anteriores a la versión 3 no guardaron el empleado del turno; se
 * reimprimen sin esa línea en lugar de atribuirlos a quien opera hoy.
 */
/**
 * Unidad de cobro utilizable para el tiquete de ingreso.
 *
 * La columna admite `day` y `month` porque la comparten las mensualidades; un
 * ingreso por tiempo nunca debería referenciarlas, pero si un dato antiguo lo
 * hace es preferible mostrar la unidad general antes que una etiqueta falsa.
 */
function asTariffBillingUnit(
  unit: RatePlanBillingUnit | null,
  fallback: TariffBillingUnit,
): TariffBillingUnit {
  return unit === 'hour' || unit === 'minute' ? unit : fallback
}

export function normalizeReceiptSnapshot(snapshot: ReceiptSnapshot): ReceiptSnapshot {
  if (snapshot.version >= RECEIPT_SNAPSHOT_VERSION) return snapshot
  const charge = snapshot.charge
  return {
    ...snapshot,
    employeeName: snapshot.employeeName ?? null,
    charge: {
      ...charge,
      plenaCount: charge.plenaCount ?? 0,
      plenaUnitCop: charge.plenaUnitCop ?? 0,
      chargedUnits: charge.chargedUnits ?? charge.billedUnits,
    },
  }
}

type ExitRow = {
  id: string
  plate: string
  monthly_customer_name: string | null
  vehicle_type: VehicleType
  rate_plan_name: string | null
  entered_at: string
  exited_at: string | null
  status: 'closed' | 'cancelled'
  calculated_amount_cop: number | null
  method: PaymentMethod | null
  receipt_number: number | null
  snapshot_json: string | null
}

/** Convierte una fecha local `AAAA-MM-DD` en el instante UTC en que empieza ese día. */
function startOfLocalDayUtc(localDate: string, addDays = 0): string {
  const [year, month, day] = localDate.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + addDays).toISOString()
}

type SessionRow = {
  id: string
  vehicle_id: string
  plate: string
  vehicle_type: VehicleType
  rate_plan_id: string | null
  rate_plan_name: string | null
  entered_at: string
  entry_snapshot_json: string | null
  notes: string | null
}

const ACTIVE_SESSION_QUERY = `
  SELECT s.id, s.vehicle_id, v.plate, v.vehicle_type, s.rate_plan_id, r.name AS rate_plan_name,
         s.entered_at, s.entry_snapshot_json, s.notes
  FROM parking_sessions s
  JOIN vehicles v ON v.id = s.vehicle_id
  LEFT JOIN rate_plans r ON r.id = s.rate_plan_id
  WHERE s.status = 'active'
`

export class ParkingService {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly tariffs: TariffService,
    private readonly monthly: MonthlyService,
    private readonly cash: CashService,
  ) {}

  registerEntry(input: RegisterEntryInput): EntryRegistration {
    const cashSessionId = this.cash.getOpenSessionId()
    if (cashSessionId === null) {
      throw new OperationError('NO_CASH_SESSION', 'Abre la caja antes de registrar ingresos.')
    }

    const plan = this.requireRatePlan(input.ratePlanId)
    if (plan.status !== 'active') {
      throw new OperationError(
        'RATE_PLAN_INACTIVE',
        'Esa tarifa está inactiva. Activa la tarifa o elige otra.',
      )
    }
    // Un plan `day` o `month` pertenece a Mensualidades: cobrarlo por tiempo
    // liquidaría el precio del periodo completo en cada unidad.
    if (plan.billingUnit !== 'hour' && plan.billingUnit !== 'minute') {
      throw new OperationError(
        'RATE_PLAN_NOT_APPLICABLE',
        'Esa tarifa pertenece a Mensualidades y no puede cobrar un ingreso por tiempo.',
      )
    }

    const openSession = this.sqlite
      .prepare(
        `SELECT s.id FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE v.plate = ? AND s.status = 'active'`,
      )
      .get(input.plate) as { id: string } | undefined
    if (openSession) {
      throw new OperationError(
        'SESSION_ALREADY_OPEN',
        `La matrícula ${input.plate} ya tiene un ingreso activo. Registra su salida antes de volver a ingresarla.`,
      )
    }

    const now = new Date().toISOString()
    const sessionId = randomUUID()
    const graceMinutes = plan.graceMinutes ?? this.tariffs.getSettings().graceMinutes
    const employeeName = this.cash.getOpenSessionEmployeeName()
    const snapshot: EntryTicketPayload = {
      version: ENTRY_TICKET_VERSION,
      sessionId,
      plate: input.plate,
      vehicleType: input.vehicleType,
      ratePlanId: plan.id,
      ratePlanName: plan.name,
      ratePlanAmountCop: plan.amountCop,
      billingUnit: plan.billingUnit,
      enteredAt: now,
      graceMinutes,
      employeeName,
      notes: input.notes,
    }

    this.sqlite.transaction(() => {
      const vehicle = this.sqlite
        .prepare('SELECT id FROM vehicles WHERE plate = ?')
        .get(input.plate) as { id: string } | undefined
      const vehicleId = vehicle?.id ?? randomUUID()

      if (vehicle) {
        this.sqlite
          .prepare('UPDATE vehicles SET vehicle_type = ?, status = ?, updated_at = ? WHERE id = ?')
          .run(input.vehicleType, 'active', now, vehicleId)
      } else {
        this.sqlite
          .prepare(
            `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, ?)`,
          )
          .run(vehicleId, input.plate, input.vehicleType, now, now)
      }

      this.sqlite
        .prepare(
          `INSERT INTO parking_sessions
           (id, vehicle_id, rate_plan_id, entered_at, entry_snapshot_json, status, notes,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(sessionId, vehicleId, plan.id, now, JSON.stringify(snapshot), input.notes, now, now)

      this.writeAudit('parking.entry_registered', 'parking_session', sessionId, now, {
        plate: input.plate,
        vehicleType: input.vehicleType,
        ratePlanId: plan.id,
      })
    })()

    return {
      sessionId,
      plate: input.plate,
      vehicleType: input.vehicleType,
      ratePlanId: plan.id,
      ratePlanName: plan.name,
      ratePlanAmountCop: plan.amountCop,
      billingUnit: plan.billingUnit,
      enteredAt: now,
      graceMinutes,
      employeeName,
      notes: input.notes,
      printed: false,
      printMessage: '',
    }
  }

  /**
   * Recupera el snapshot del ingreso de una sesión activa para reimprimirlo.
   *
   * Solo se reimprime mientras la sesión sigue activa. Un tiquete es lo que el
   * cliente entrega para retirar el vehículo, así que reemitirlo después de la
   * salida o de una anulación produciría un comprobante válido de un vehículo
   * que ya no está en el parqueadero.
   */
  findEntryRegistration(sessionId: string): EntryRegistration {
    const row = this.sqlite
      .prepare(
        `SELECT s.id, v.plate, v.vehicle_type, s.rate_plan_id, s.entered_at,
                s.entry_snapshot_json, s.notes,
                r.name AS rate_plan_name, r.amount_cop AS rate_plan_amount_cop,
                r.billing_unit, r.grace_minutes
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
         LEFT JOIN rate_plans r ON r.id = s.rate_plan_id
         WHERE s.id = ? AND s.status = 'active'`,
      )
      .get(sessionId) as
      | {
          id: string
          plate: string
          vehicle_type: VehicleType
          rate_plan_id: string | null
          entered_at: string
          entry_snapshot_json: string | null
          notes: string | null
          rate_plan_name: string | null
          rate_plan_amount_cop: number | null
          billing_unit: RatePlanBillingUnit | null
          grace_minutes: number | null
        }
      | undefined
    if (!row) {
      throw new OperationError(
        'SESSION_NOT_ACTIVE',
        'Ese ingreso ya no está activo, así que no hay tiquete que reimprimir.',
      )
    }

    const stored = this.parseEntrySnapshot(row.entry_snapshot_json)
    if (stored !== null) return this.registrationFromSnapshot(stored)

    const settings = this.tariffs.getSettings()
    return {
      sessionId: row.id,
      plate: row.plate,
      vehicleType: row.vehicle_type,
      ratePlanId: row.rate_plan_id ?? 'legacy',
      ratePlanName: row.rate_plan_name ?? 'Sin tarifa',
      ratePlanAmountCop: row.rate_plan_amount_cop ?? 0,
      billingUnit: asTariffBillingUnit(row.billing_unit, settings.billingUnit),
      enteredAt: row.entered_at,
      graceMinutes: row.grace_minutes ?? settings.graceMinutes,
      employeeName: null,
      notes: row.notes,
      printed: false,
      printMessage: '',
    }
  }

  /** Resuelve una salida por QR, Code 128 o matrícula escrita. */
  resolveExitTarget(code: string): ActiveSession {
    const scanned = decodeEntryTicketCode(code)
    if (isEntryTicketCode(code) && scanned === null) {
      throw new OperationError(
        'ENTRY_TICKET_INVALID',
        'El código del tiquete está incompleto o no se pudo leer. Intenta escanearlo nuevamente.',
      )
    }

    if (scanned !== null) {
      const row = this.requireActiveSession(scanned.sessionId)
      if (scanned.kind === 'qr') this.assertTicketMatchesSession(scanned.payload, row)
      return this.toActiveSession(row, new Date().toISOString())
    }

    const plateResult = plateSchema.safeParse(normalizePlate(code))
    if (!plateResult.success) {
      throw new OperationError(
        'PLATE_OR_TICKET_INVALID',
        'Escanea un tiquete de ingreso o escribe una matrícula válida.',
      )
    }
    const row = this.sqlite
      .prepare(`${ACTIVE_SESSION_QUERY} AND v.plate = ?`)
      .get(plateResult.data) as SessionRow | undefined
    if (!row) {
      throw new OperationError(
        'SESSION_NOT_FOUND',
        `No hay ningún ingreso activo con la matrícula ${plateResult.data}.`,
      )
    }
    return this.toActiveSession(row, new Date().toISOString())
  }

  listActiveSessions(input: ListActiveSessionsInput): ActiveSession[] {
    const search = input.search.toUpperCase()
    const rows = (
      search === ''
        ? this.sqlite.prepare(`${ACTIVE_SESSION_QUERY} ORDER BY s.entered_at DESC`).all()
        : this.sqlite
            .prepare(`${ACTIVE_SESSION_QUERY} AND v.plate LIKE ? ORDER BY s.entered_at DESC`)
            .all(`%${search}%`)
    ) as SessionRow[]
    const now = new Date().toISOString()
    return rows.map((row) => this.toActiveSession(row, now))
  }

  quoteExit(sessionId: string): SessionQuote {
    const row = this.requireActiveSession(sessionId)
    const quotedAt = new Date().toISOString()
    return {
      session: this.toActiveSession(row, quotedAt),
      charge: this.chargeFor(row, quotedAt),
      quotedAt,
    }
  }

  closeSession(input: CloseSessionInput): ExitRegistration {
    const row = this.requireActiveSession(input.sessionId)
    const exitedAt = new Date().toISOString()
    const coverage = this.monthly.findCoverageForVehicle(row.vehicle_id, exitedAt)
    const charge = this.chargeFor(row, exitedAt, coverage)

    if (charge.totalCop !== input.expectedTotalCop) {
      throw new OperationError(
        'CHARGE_CHANGED',
        'El tiempo avanzó y el total cambió mientras confirmabas. Revisa el nuevo valor y vuelve a cobrar.',
      )
    }

    if (charge.totalCop > 0 && this.cash.getOpenSessionId() === null) {
      throw new OperationError('NO_CASH_SESSION', 'Abre la caja antes de cobrar una salida.')
    }

    const receivedCop = input.method === 'cash' ? input.receivedCop : null
    if (
      charge.totalCop > 0 &&
      input.method === 'cash' &&
      (receivedCop === null || receivedCop < charge.totalCop)
    ) {
      throw new OperationError(
        'INSUFFICIENT_CASH',
        'Registra el efectivo recibido y que cubra el total a cobrar.',
      )
    }
    const changeCop = calculateChange(charge.totalCop, receivedCop)

    let receiptNumber: number | null = null

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE parking_sessions
           SET exited_at = ?, status = 'closed', calculated_amount_cop = ?, subscription_id = ?,
               notes = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`,
        )
        .run(
          exitedAt,
          charge.totalCop,
          coverage?.subscriptionId ?? null,
          input.notes ?? row.notes,
          exitedAt,
          input.sessionId,
        )

      if (charge.totalCop > 0) {
        const paymentId = randomUUID()
        const cashSessionId = this.cash.getOpenSessionId()
        this.sqlite
          .prepare(
            `INSERT INTO payments
             (id, parking_session_id, cash_register_session_id, amount_cop, method, status,
              paid_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
          )
          .run(
            paymentId,
            input.sessionId,
            cashSessionId,
            charge.totalCop,
            input.method,
            exitedAt,
            exitedAt,
            exitedAt,
          )

        const next = this.sqlite
          .prepare('SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next FROM receipts')
          .get() as { next: number }
        receiptNumber = next.next

        const snapshot: ReceiptSnapshot = {
          version: RECEIPT_SNAPSHOT_VERSION,
          receiptNumber,
          issuedAt: exitedAt,
          plate: row.plate,
          vehicleType: row.vehicle_type,
          ratePlanName: row.rate_plan_name,
          enteredAt: row.entered_at,
          exitedAt,
          charge,
          method: input.method,
          receivedCop,
          changeCop,
          employeeName: this.cash.getOpenSessionEmployeeName(),
          notes: input.notes,
        }

        this.sqlite
          .prepare(
            `INSERT INTO receipts
             (id, receipt_number, payment_id, issued_at, status, snapshot_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            receiptNumber,
            paymentId,
            exitedAt,
            JSON.stringify(snapshot),
            exitedAt,
            exitedAt,
          )
      }

      this.writeAudit('parking.exit_registered', 'parking_session', input.sessionId, exitedAt, {
        plate: row.plate,
        totalCop: charge.totalCop,
        method: input.method,
        receiptNumber,
        subscriptionId: coverage?.subscriptionId ?? null,
      })
    })()

    return {
      sessionId: input.sessionId,
      plate: row.plate,
      vehicleType: row.vehicle_type,
      ratePlanName: row.rate_plan_name,
      enteredAt: row.entered_at,
      exitedAt,
      charge,
      method: input.method,
      receivedCop,
      changeCop,
      receiptNumber,
      monthlyCoverage: coverage,
      printed: false,
      printMessage: '',
    }
  }

  cancelSession(input: CancelSessionInput): ActiveSession[] {
    const row = this.requireActiveSession(input.sessionId)
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE parking_sessions
           SET status = 'cancelled', exited_at = ?, calculated_amount_cop = 0, updated_at = ?
           WHERE id = ? AND status = 'active'`,
        )
        .run(now, now, input.sessionId)
      this.writeAudit('parking.entry_cancelled', 'parking_session', input.sessionId, now, {
        plate: row.plate,
        reason: input.reason,
      })
    })()

    return this.listActiveSessions({ search: '' })
  }

  /**
   * Historial de salidas cerradas y anuladas, de la más reciente a la más antigua.
   *
   * Los totales se calculan sobre todo el filtro, no solo sobre la página.
   */
  listExits(input: ListExitsInput): ExitHistory {
    const conditions: string[] = ["s.status IN ('closed', 'cancelled')"]
    const params: unknown[] = []

    if (input.search !== '') {
      conditions.push('v.plate LIKE ?')
      params.push(`%${input.search.toUpperCase()}%`)
    }
    if (input.from !== '') {
      conditions.push('s.exited_at >= ?')
      params.push(startOfLocalDayUtc(input.from))
    }
    if (input.to !== '') {
      conditions.push('s.exited_at < ?')
      params.push(startOfLocalDayUtc(input.to, 1))
    }
    const where = conditions.join(' AND ')

    const rows = this.sqlite
      .prepare(
        `SELECT s.id, v.plate, v.vehicle_type, r.name AS rate_plan_name,
                s.entered_at, s.exited_at, s.status, s.calculated_amount_cop,
                p.method, rc.receipt_number, rc.snapshot_json,
                mc.full_name AS monthly_customer_name
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
         LEFT JOIN rate_plans r ON r.id = s.rate_plan_id
         LEFT JOIN payments p ON p.parking_session_id = s.id AND p.status = 'completed'
         LEFT JOIN receipts rc ON rc.payment_id = p.id AND rc.status = 'issued'
         LEFT JOIN monthly_subscriptions ms ON ms.id = s.subscription_id
         LEFT JOIN monthly_customers mc ON mc.id = ms.customer_id
         WHERE ${where}
         ORDER BY s.exited_at DESC, s.rowid DESC
         LIMIT ?`,
      )
      .all(...params, input.limit) as ExitRow[]

    const totals = this.sqlite
      .prepare(
        `SELECT count(*) AS total,
                COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount_cop ELSE 0 END), 0) AS collected
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
         LEFT JOIN payments p ON p.parking_session_id = s.id AND p.status = 'completed'
         WHERE ${where}`,
      )
      .get(...params) as { total: number; collected: number }

    return {
      records: rows.map((row) => this.toExitRecord(row)),
      totalCount: totals.total,
      totalCollectedCop: totals.collected,
    }
  }

  private toExitRecord(row: ExitRow): ExitRecord {
    const snapshot =
      row.snapshot_json === null
        ? null
        : normalizeReceiptSnapshot(JSON.parse(row.snapshot_json) as ReceiptSnapshot)
    const exitedAt = row.exited_at ?? row.entered_at
    return {
      sessionId: row.id,
      plate: row.plate,
      vehicleType: row.vehicle_type,
      ratePlanName: row.rate_plan_name,
      enteredAt: row.entered_at,
      exitedAt,
      totalMinutes: snapshot?.charge.totalMinutes ?? elapsedMinutesOrZero(row.entered_at, exitedAt),
      totalCop: row.calculated_amount_cop ?? 0,
      status: row.status,
      method: row.method,
      receiptNumber: row.receipt_number,
      charge: snapshot?.charge ?? null,
      monthlyCustomerName: row.monthly_customer_name,
    }
  }

  /** Recupera el recibo emitido para reimprimirlo sin recalcular nada. */
  findReceiptSnapshot(sessionId: string): ReceiptSnapshot {
    const row = this.sqlite
      .prepare(
        `SELECT r.snapshot_json FROM receipts r
         JOIN payments p ON p.id = r.payment_id
         WHERE p.parking_session_id = ? AND r.status = 'issued'
         ORDER BY r.receipt_number DESC LIMIT 1`,
      )
      .get(sessionId) as { snapshot_json: string } | undefined
    if (!row) {
      throw new OperationError(
        'RECEIPT_NOT_FOUND',
        'Esta salida no generó un recibo, por lo que no hay nada que reimprimir.',
      )
    }
    return normalizeReceiptSnapshot(JSON.parse(row.snapshot_json) as ReceiptSnapshot)
  }

  /**
   * Cobro de una sesión al instante indicado.
   *
   * Una mensualidad vigente en ese momento deja el total en cero sin ocultar la
   * permanencia: el desglose sigue mostrando cuánto tiempo estuvo el vehículo.
   */
  private chargeFor(
    row: SessionRow,
    atUtc: string,
    knownCoverage?: MonthlyCoverage | null,
  ): ParkingCharge {
    const settings = this.tariffs.getSettings()
    const coverage =
      knownCoverage === undefined
        ? this.monthly.findCoverageForVehicle(row.vehicle_id, atUtc)
        : knownCoverage
    const pricing =
      coverage === null ? this.pricingFor(row.rate_plan_id) : COVERED_BY_MONTHLY_PRICING
    return calculateChargeForMinutes(this.stayMinutes(row.entered_at, atUtc), settings, pricing)
  }

  /**
   * Permanencia cobrable, con un mensaje accionable si el reloj retrocedió.
   *
   * `elapsedMinutes` rechaza un intervalo invertido con un `RangeError`, que
   * llegaría al operador como un fallo genérico y sin salida: no podría
   * registrar la salida ni sabría que el problema es la hora del equipo.
   */
  private stayMinutes(enteredAt: string, atUtc: string): number {
    if (new Date(atUtc).getTime() < new Date(enteredAt).getTime()) {
      throw new OperationError(
        'CLOCK_BEFORE_ENTRY',
        'La hora del equipo es anterior a la del ingreso, así que no se puede calcular el cobro. Ajusta la fecha y la hora del sistema e inténtalo de nuevo.',
      )
    }
    return elapsedMinutes(enteredAt, atUtc)
  }

  private pricingFor(ratePlanId: string | null): RatePlanPricing {
    if (ratePlanId === null) {
      return { amountCop: 0, minimumChargeCop: 0, plenaCop: null, graceMinutes: null }
    }
    const plan = this.requireRatePlan(ratePlanId)
    return {
      amountCop: plan.amountCop,
      minimumChargeCop: plan.minimumChargeCop,
      plenaCop: plan.plenaCop,
      graceMinutes: plan.graceMinutes,
    }
  }

  private parseEntrySnapshot(snapshotJson: string | null): EntryTicketPayload | null {
    if (snapshotJson === null) return null
    try {
      const parsed = entryTicketPayloadSchema.safeParse(JSON.parse(snapshotJson) as unknown)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private registrationFromSnapshot(snapshot: EntryTicketPayload): EntryRegistration {
    return {
      ...snapshot,
      printed: false,
      printMessage: '',
    }
  }

  private assertTicketMatchesSession(payload: EntryTicketPayload, row: SessionRow): void {
    const stored = this.parseEntrySnapshot(row.entry_snapshot_json)
    const matchesStored = stored !== null && JSON.stringify(stored) === JSON.stringify(payload)
    const matchesLegacy =
      stored === null &&
      payload.sessionId === row.id &&
      payload.plate === row.plate &&
      payload.vehicleType === row.vehicle_type &&
      payload.ratePlanId === row.rate_plan_id &&
      payload.enteredAt === row.entered_at
    if (matchesStored || matchesLegacy) return

    throw new OperationError(
      'ENTRY_TICKET_MISMATCH',
      'El código no coincide con los datos guardados para este ingreso. Escribe la matrícula para continuar.',
    )
  }

  private requireRatePlan(id: string): {
    id: string
    name: string
    status: string
    amountCop: number
    billingUnit: RatePlanBillingUnit
    minimumChargeCop: number
    plenaCop: number | null
    graceMinutes: number | null
  } {
    const row = this.sqlite.prepare('SELECT * FROM rate_plans WHERE id = ?').get(id) as
      | {
          id: string
          name: string
          status: string
          amount_cop: number
          billing_unit: RatePlanBillingUnit
          minimum_charge_cop: number
          plena_cop: number | null
          grace_minutes: number | null
        }
      | undefined
    if (!row) {
      throw new OperationError('RATE_PLAN_NOT_FOUND', 'La tarifa seleccionada ya no existe.')
    }
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      amountCop: row.amount_cop,
      billingUnit: row.billing_unit,
      minimumChargeCop: row.minimum_charge_cop,
      plenaCop: row.plena_cop,
      graceMinutes: row.grace_minutes,
    }
  }

  private requireActiveSession(sessionId: string): SessionRow {
    const row = this.sqlite.prepare(`${ACTIVE_SESSION_QUERY} AND s.id = ?`).get(sessionId) as
      SessionRow | undefined
    if (!row) {
      throw new OperationError(
        'SESSION_NOT_ACTIVE',
        'Esa sesión ya no está activa. Actualiza el listado de parqueo.',
      )
    }
    return row
  }

  private toActiveSession(row: SessionRow, atUtc: string): ActiveSession {
    return {
      id: row.id,
      plate: row.plate,
      vehicleType: row.vehicle_type,
      ratePlanId: row.rate_plan_id,
      ratePlanName: row.rate_plan_name,
      enteredAt: row.entered_at,
      notes: row.notes,
      monthlyCoverage: this.monthly.findCoverageForVehicle(row.vehicle_id, atUtc),
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
