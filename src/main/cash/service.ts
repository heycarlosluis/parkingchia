import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { CashCloseSummary, CashMovement, CashSession, CashState } from '@shared/contracts'
import {
  type CloseCashSessionInput,
  type OpenCashSessionInput,
  type VoidPaymentInput,
} from '@shared/cash'
import { OperationError } from '@main/ipc/errors'

type SessionRow = {
  id: string
  employee_id: string | null
  employee_name: string | null
  opened_at: string
  closed_at: string | null
  opening_amount_cop: number
  closing_amount_cop: number | null
  expected_amount_cop: number | null
  status: 'open' | 'closed'
  notes: string | null
}

type TotalsRow = {
  collected: number
  voided: number
  count: number
}

type ClosedSessionRow = {
  session_id: string
  opened_at: string
  closed_at: string | null
  opening_amount_cop: number
  closing_amount_cop: number | null
  expected_amount_cop: number | null
  employee_name: string | null
  collected_cop: number
  voided_cop: number
  movement_count: number
}

const CLOSED_SESSIONS_QUERY = `
  SELECT s.id AS session_id, s.opened_at, s.closed_at, s.opening_amount_cop,
         s.closing_amount_cop, s.expected_amount_cop, e.full_name AS employee_name,
         COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount_cop ELSE 0 END), 0) AS collected_cop,
         COALESCE(SUM(CASE WHEN p.status = 'voided' THEN p.amount_cop ELSE 0 END), 0) AS voided_cop,
         COUNT(p.id) AS movement_count
  FROM cash_register_sessions s
  LEFT JOIN employees e ON e.id = s.employee_id
  LEFT JOIN payments p ON p.cash_register_session_id = s.id
  WHERE s.status = 'closed'
  GROUP BY s.id
`

const MOVEMENT_QUERY = `
  SELECT p.id AS payment_id, p.amount_cop, p.method, p.status, p.paid_at, p.reference,
         rc.receipt_number,
         CASE WHEN p.parking_session_id IS NOT NULL THEN 'parking' ELSE 'monthly' END AS source,
         COALESCE(v_parking.plate, v_monthly.plate) AS plate,
         mc.full_name AS customer_name
  FROM payments p
  LEFT JOIN receipts rc ON rc.payment_id = p.id
  LEFT JOIN parking_sessions ps ON ps.id = p.parking_session_id
  LEFT JOIN vehicles v_parking ON v_parking.id = ps.vehicle_id
  LEFT JOIN monthly_subscriptions ms ON ms.id = p.subscription_id
  LEFT JOIN vehicles v_monthly ON v_monthly.id = ms.vehicle_id
  LEFT JOIN monthly_customers mc ON mc.id = ms.customer_id
  WHERE p.cash_register_session_id = ?
  ORDER BY p.paid_at DESC, p.rowid DESC
`

export class CashService {
  constructor(private readonly sqlite: Database.Database) {}

  /** Estado actual de la caja: la sesión abierta, sus movimientos y el arqueo en vivo. */
  getState(): CashState {
    const session = this.getOpenSession()
    if (session === null) {
      return {
        session: null,
        movements: [],
        collectedCop: 0,
        voidedCop: 0,
        expectedCop: 0,
        movementCount: 0,
      }
    }
    const totals = this.totalsFor(session.id)
    return {
      session,
      movements: this.listMovements(session.id),
      collectedCop: totals.collected,
      voidedCop: totals.voided,
      expectedCop: session.openingAmountCop + totals.collected,
      movementCount: totals.count,
    }
  }

  openSession(input: OpenCashSessionInput): CashState {
    if (this.getOpenSession() !== null) {
      throw new OperationError(
        'CASH_ALREADY_OPEN',
        'Ya hay una caja abierta. Ciérrala antes de abrir otra.',
      )
    }

    const employee = this.sqlite
      .prepare('SELECT id, full_name, status FROM employees WHERE id = ?')
      .get(input.employeeId) as { id: string; full_name: string; status: string } | undefined
    if (!employee) {
      throw new OperationError('EMPLOYEE_NOT_FOUND', 'El empleado seleccionado ya no existe.')
    }
    if (employee.status !== 'active') {
      throw new OperationError(
        'EMPLOYEE_INACTIVE',
        'El empleado seleccionado está inactivo. Actívalo o elige otro.',
      )
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO cash_register_sessions
           (id, employee_id, opened_at, opening_amount_cop, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
        )
        .run(id, input.employeeId, now, input.openingAmountCop, input.notes, now, now)
      this.writeAudit('cash.session_opened', 'cash_register_session', id, now, {
        employeeId: input.employeeId,
        openingAmountCop: input.openingAmountCop,
      })
    })()

    return this.getState()
  }

  closeSession(input: CloseCashSessionInput): CashCloseSummary {
    const session = this.getOpenSession()
    if (session === null) {
      throw new OperationError('NO_CASH_SESSION', 'No hay una caja abierta para cerrar.')
    }

    const now = new Date().toISOString()
    const totals = this.totalsFor(session.id)
    const expectedAmountCop = session.openingAmountCop + totals.collected

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE cash_register_sessions
           SET closed_at = ?, closing_amount_cop = ?, expected_amount_cop = ?,
               status = 'closed', notes = COALESCE(?, notes), updated_at = ?
           WHERE id = ?`,
        )
        .run(now, input.closingAmountCop, expectedAmountCop, input.notes, now, session.id)
      this.writeAudit('cash.session_closed', 'cash_register_session', session.id, now, {
        openingAmountCop: session.openingAmountCop,
        collectedCop: totals.collected,
        voidedCop: totals.voided,
        expectedAmountCop,
        closingAmountCop: input.closingAmountCop,
        differenceCop: input.closingAmountCop - expectedAmountCop,
      })
    })()

    return {
      sessionId: session.id,
      employeeName: session.employeeName,
      openedAt: session.openedAt,
      closedAt: now,
      openingAmountCop: session.openingAmountCop,
      collectedCop: totals.collected,
      voidedCop: totals.voided,
      expectedAmountCop,
      closingAmountCop: input.closingAmountCop,
      differenceCop: input.closingAmountCop - expectedAmountCop,
      movementCount: totals.count,
    }
  }

  /**
   * Anula un cobro ya emitido con motivo.
   *
   * Solo se anulan cobros de la caja abierta: modificar una caja cerrada rompería
   * su arqueo, que queda inmutable tras el cierre.
   */
  voidPayment(input: VoidPaymentInput): CashState {
    const session = this.getOpenSession()
    if (session === null) {
      throw new OperationError('NO_CASH_SESSION', 'Abre la caja antes de anular un cobro.')
    }

    const payment = this.sqlite
      .prepare(`SELECT id, status, cash_register_session_id, amount_cop FROM payments WHERE id = ?`)
      .get(input.paymentId) as
      | { id: string; status: string; cash_register_session_id: string | null; amount_cop: number }
      | undefined
    if (!payment) {
      throw new OperationError('PAYMENT_NOT_FOUND', 'Ese cobro ya no existe.')
    }
    if (payment.cash_register_session_id !== session.id) {
      throw new OperationError(
        'PAYMENT_NOT_IN_SESSION',
        'Ese cobro no pertenece a la caja abierta y no se puede anular desde aquí.',
      )
    }
    if (payment.status !== 'completed') {
      throw new OperationError('PAYMENT_NOT_COMPLETED', 'Ese cobro ya no se puede anular.')
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare("UPDATE payments SET status = 'voided', updated_at = ? WHERE id = ?")
        .run(now, input.paymentId)
      this.sqlite
        .prepare(
          "UPDATE receipts SET status = 'voided', updated_at = ? WHERE payment_id = ? AND status = 'issued'",
        )
        .run(now, input.paymentId)
      this.writeAudit('cash.payment_voided', 'payment', input.paymentId, now, {
        amountCop: payment.amount_cop,
        reason: input.reason,
        cashSessionId: session.id,
      })
    })()

    return this.getState()
  }

  /** Identificador de la caja abierta, o `null` cuando el turno no ha iniciado. */
  getOpenSessionId(): string | null {
    return this.getOpenSession()?.id ?? null
  }

  /** Cierres de caja más recientes, con el arqueo completo para consultarlos o reimprimirlos. */
  listClosedSessions(limit = 20): CashCloseSummary[] {
    const rows = this.sqlite
      .prepare(`${CLOSED_SESSIONS_QUERY} ORDER BY s.closed_at DESC LIMIT ?`)
      .all(limit) as ClosedSessionRow[]
    return rows.map((row) => this.toCloseSummary(row))
  }

  /** Resumen de un cierre concreto, para reimprimir su recibo. */
  getCloseSummary(sessionId: string): CashCloseSummary {
    const row = this.sqlite.prepare(`${CLOSED_SESSIONS_QUERY} AND s.id = ?`).get(sessionId) as
      ClosedSessionRow | undefined
    if (!row) {
      throw new OperationError('CASH_SESSION_NOT_FOUND', 'Ese cierre de caja ya no existe.')
    }
    return this.toCloseSummary(row)
  }

  private getOpenSession(): CashSession | null {
    const row = this.sqlite
      .prepare(
        `SELECT s.*, e.full_name AS employee_name
         FROM cash_register_sessions s
         LEFT JOIN employees e ON e.id = s.employee_id
         WHERE s.status = 'open' LIMIT 1`,
      )
      .get() as SessionRow | undefined
    return row ? this.toSession(row) : null
  }

  private totalsFor(sessionId: string): TotalsRow {
    const row = this.sqlite
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_cop ELSE 0 END), 0) AS collected,
           COALESCE(SUM(CASE WHEN status = 'voided' THEN amount_cop ELSE 0 END), 0) AS voided,
           COUNT(*) AS count
         FROM payments WHERE cash_register_session_id = ?`,
      )
      .get(sessionId) as TotalsRow
    return { collected: row.collected, voided: row.voided, count: row.count }
  }

  private listMovements(sessionId: string): CashMovement[] {
    const rows = this.sqlite.prepare(MOVEMENT_QUERY).all(sessionId) as Array<{
      payment_id: string
      amount_cop: number
      method: CashMovement['method']
      status: CashMovement['status']
      paid_at: string
      reference: string | null
      receipt_number: number | null
      source: CashMovement['source']
      plate: string | null
      customer_name: string | null
    }>
    return rows.map((row) => ({
      paymentId: row.payment_id,
      receiptNumber: row.receipt_number,
      paidAt: row.paid_at,
      amountCop: row.amount_cop,
      method: row.method,
      status: row.status,
      source: row.source,
      plate: row.plate,
      customerName: row.customer_name,
      reference: row.reference,
    }))
  }

  private toSession(row: SessionRow): CashSession {
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openingAmountCop: row.opening_amount_cop,
      closingAmountCop: row.closing_amount_cop,
      expectedAmountCop: row.expected_amount_cop,
      status: row.status,
      notes: row.notes,
    }
  }

  private toCloseSummary(row: ClosedSessionRow): CashCloseSummary {
    const closingAmountCop = row.closing_amount_cop ?? 0
    const expectedAmountCop = row.expected_amount_cop ?? 0
    return {
      sessionId: row.session_id,
      employeeName: row.employee_name,
      openedAt: row.opened_at,
      closedAt: row.closed_at ?? row.opened_at,
      openingAmountCop: row.opening_amount_cop,
      collectedCop: row.collected_cop,
      voidedCop: row.voided_cop,
      expectedAmountCop,
      closingAmountCop,
      differenceCop: closingAmountCop - expectedAmountCop,
      movementCount: row.movement_count,
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
