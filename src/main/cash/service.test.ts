// @vitest-environment node
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { CashService } from '@main/cash/service'
import { EmployeeService } from '@main/employee/service'
import { MonthlyService } from '@main/monthly/service'

let directory = ''
let manager: DatabaseManager
let cash: CashService
let monthly: MonthlyService
let employees: EmployeeService
let customerId = ''
let planId = ''
let employeeId = ''

const opening = 50_000

function openSession(amountCop = opening): ReturnType<CashService['openSession']> {
  return cash.openSession({ employeeId, openingAmountCop: amountCop, notes: null })
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-cash-'))
  manager = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  manager.initialize()
  cash = new CashService(manager.getNativeConnection())
  monthly = new MonthlyService(manager.getNativeConnection(), cash)
  employees = new EmployeeService(manager.getNativeConnection())
  employeeId = employees.create({
    fullName: 'Laura Torres',
    documentNumber: '1012345678',
    status: 'active',
  }).id
  customerId = monthly.createCustomer({
    fullName: 'Carlos Andrés Peña',
    documentNumber: '1098765432',
    phone: null,
    email: null,
    notes: null,
    status: 'active',
  }).id
  planId = monthly.createPlan({
    name: 'Mensualidad automóvil',
    vehicleType: 'car',
    amountCop: 150_000,
    status: 'active',
  }).id
})

afterEach(() => {
  manager.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

/** Inserta un pago de parqueo ya asociado a la caja para probar su movimiento. */
function seedParkingPayment(cashSessionId: string, amountCop: number, plate: string): string {
  const db = manager.getNativeConnection()
  const now = new Date().toISOString()
  const vehicleId = randomUUID()
  const sessionId = randomUUID()
  const paymentId = randomUUID()
  const next = db
    .prepare('SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next FROM receipts')
    .get() as {
    next: number
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
       VALUES (?, ?, 'car', 'active', ?, ?)`,
    ).run(vehicleId, plate, now, now)
    db.prepare(
      `INSERT INTO parking_sessions
       (id, vehicle_id, entered_at, exited_at, status, calculated_amount_cop, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'closed', ?, ?, ?)`,
    ).run(sessionId, vehicleId, now, now, amountCop, now, now)
    db.prepare(
      `INSERT INTO payments
       (id, parking_session_id, cash_register_session_id, amount_cop, method, status, paid_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'cash', 'completed', ?, ?, ?)`,
    ).run(paymentId, sessionId, cashSessionId, amountCop, now, now, now)
    db.prepare(
      `INSERT INTO receipts
       (id, receipt_number, payment_id, issued_at, status, snapshot_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)`,
    ).run(randomUUID(), next.next, paymentId, now, '{}', now, now)
  })()
  return paymentId
}

describe('apertura y cierre de caja', () => {
  it('inicia sin caja abierta y rechaza cerrar sin abrir', () => {
    expect(cash.getState().session).toBeNull()
    expect(cash.getOpenSessionId()).toBeNull()
    expect(() => cash.closeSession({ closingAmountCop: 0, notes: null })).toThrow(
      expect.objectContaining({ code: 'NO_CASH_SESSION' }),
    )
  })

  it('abre una caja y no permite una segunda abierta', () => {
    const state = openSession()
    expect(state.session).toMatchObject({ status: 'open', openingAmountCop: opening })
    expect(state.expectedCop).toBe(opening)

    expect(() => openSession(1)).toThrow(expect.objectContaining({ code: 'CASH_ALREADY_OPEN' }))
  })

  it('cierra la caja calculando lo esperado y la diferencia', () => {
    openSession()
    const summary = cash.closeSession({ closingAmountCop: 80_000, notes: 'Cierre del turno' })
    expect(summary).toMatchObject({
      openingAmountCop: opening,
      collectedCop: 0,
      expectedAmountCop: opening,
      closingAmountCop: 80_000,
      differenceCop: 30_000,
    })
    expect(cash.getState().session).toBeNull()

    const stored = manager
      .getNativeConnection()
      .prepare('SELECT status, expected_amount_cop, closing_amount_cop FROM cash_register_sessions')
      .get() as { status: string; expected_amount_cop: number; closing_amount_cop: number }
    expect(stored).toMatchObject({
      status: 'closed',
      expected_amount_cop: opening,
      closing_amount_cop: 80_000,
    })
  })
})

describe('arqueo en vivo', () => {
  it('suma lo cobrado y lo anulado a la caja abierta', () => {
    openSession()
    seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    seedParkingPayment(cash.getOpenSessionId()!, 5_000, 'XYZ999')

    const state = cash.getState()
    expect(state.collectedCop).toBe(15_000)
    expect(state.voidedCop).toBe(0)
    expect(state.expectedCop).toBe(opening + 15_000)
    expect(state.movementCount).toBe(2)
    expect(state.movements.map((movement) => movement.plate).sort()).toEqual(['ABC123', 'XYZ999'])
    expect(state.movements[0]).toMatchObject({ source: 'parking', status: 'completed' })
  })
})

describe('anulación de cobros', () => {
  it('anula un cobro con motivo y lo descuenta del arqueo', () => {
    openSession()
    const paymentId = seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')

    const state = cash.voidPayment({ paymentId, reason: 'Se cobró la tarifa equivocada' })
    expect(state.collectedCop).toBe(0)
    expect(state.voidedCop).toBe(10_000)
    expect(state.expectedCop).toBe(opening)
    expect(state.movements[0]).toMatchObject({ status: 'voided', paymentId })

    const receipt = manager
      .getNativeConnection()
      .prepare('SELECT status FROM receipts WHERE payment_id = ?')
      .get(paymentId) as { status: string }
    expect(receipt.status).toBe('voided')
  })

  it('rechaza anular sin caja, fuera de la caja o ya anulado', () => {
    expect(() => cash.voidPayment({ paymentId: 'x', reason: 'Motivo válido' })).toThrow(
      expect.objectContaining({ code: 'NO_CASH_SESSION' }),
    )

    openSession()
    const paymentId = seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    cash.closeSession({ closingAmountCop: 0, notes: null })

    expect(() => cash.voidPayment({ paymentId, reason: 'Motivo válido' })).toThrow(
      expect.objectContaining({ code: 'NO_CASH_SESSION' }),
    )
  })

  it('rechaza anular un cobro que ya no está completado', () => {
    openSession()
    const paymentId = seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    cash.voidPayment({ paymentId, reason: 'Primera anulación' })

    expect(() => cash.voidPayment({ paymentId, reason: 'Otra anulación' })).toThrow(
      expect.objectContaining({ code: 'PAYMENT_NOT_COMPLETED' }),
    )
  })
})

describe('asociación de pagos a la caja abierta', () => {
  it('liga un pago de mensualidad a la caja y lo muestra como movimiento', () => {
    openSession()
    const subscription = monthly.createSubscription({
      customerId,
      plate: 'MEN001',
      vehicleType: 'car',
      ratePlanId: planId,
      startDate: '2026-08-19',
      endDate: '2026-09-18',
      amountCop: 150_000,
      notes: null,
    })
    monthly.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 150_000,
      method: 'transfer',
      receivedCop: null,
      reference: 'TRX-1',
    })

    const state = cash.getState()
    expect(state.collectedCop).toBe(150_000)
    expect(state.expectedCop).toBe(opening + 150_000)
    expect(state.movements[0]).toMatchObject({
      source: 'monthly',
      customerName: 'Carlos Andrés Peña',
      plate: 'MEN001',
      reference: 'TRX-1',
    })

    const payment = manager
      .getNativeConnection()
      .prepare('SELECT cash_register_session_id FROM payments WHERE subscription_id = ?')
      .get(subscription.id) as { cash_register_session_id: string }
    expect(payment.cash_register_session_id).toBe(cash.getOpenSessionId())
  })

  it('rechaza registrar un pago cuando no hay caja abierta', () => {
    const subscription = monthly.createSubscription({
      customerId,
      plate: 'MEN002',
      vehicleType: 'car',
      ratePlanId: planId,
      startDate: '2026-08-19',
      endDate: '2026-09-18',
      amountCop: 150_000,
      notes: null,
    })
    expect(() =>
      monthly.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 50_000,
        method: 'cash',
        receivedCop: null,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'NO_CASH_SESSION' }))
  })
})

describe('empleado asociado a la caja', () => {
  it('guarda el empleado y lo devuelve en la sesión y el cierre', () => {
    const state = openSession()
    expect(state.session).toMatchObject({ employeeId, employeeName: 'Laura Torres' })

    const summary = cash.closeSession({ closingAmountCop: opening, notes: null })
    expect(summary.employeeName).toBe('Laura Torres')
  })

  it('rechaza abrir con un empleado inexistente o inactivo', () => {
    expect(() =>
      cash.openSession({ employeeId: 'no-existe', openingAmountCop: 0, notes: null }),
    ).toThrow(expect.objectContaining({ code: 'EMPLOYEE_NOT_FOUND' }))

    employees.update({
      id: employeeId,
      fullName: 'Laura Torres',
      documentNumber: '1012345678',
      status: 'inactive',
    })
    expect(() => cash.openSession({ employeeId, openingAmountCop: 0, notes: null })).toThrow(
      expect.objectContaining({ code: 'EMPLOYEE_INACTIVE' }),
    )
  })
})

describe('historial de cierres', () => {
  it('lista los cierres con su arqueo y permite recuperar uno', () => {
    openSession()
    seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    const summary = cash.closeSession({ closingAmountCop: 60_000, notes: null })

    const sessions = cash.listClosedSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: summary.sessionId,
      employeeName: 'Laura Torres',
      collectedCop: 10_000,
      expectedAmountCop: 60_000,
      closingAmountCop: 60_000,
      differenceCop: 0,
      movementCount: 1,
    })

    expect(cash.getCloseSummary(summary.sessionId)).toMatchObject({
      sessionId: summary.sessionId,
      employeeName: 'Laura Torres',
    })
  })

  it('rechaza recuperar un cierre inexistente', () => {
    expect(() => cash.getCloseSummary('no-existe')).toThrow(
      expect.objectContaining({ code: 'CASH_SESSION_NOT_FOUND' }),
    )
  })
})
