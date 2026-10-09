// @vitest-environment node
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { createCashCloseCsv, csvSeparatorFor } from '@main/cash/export'
import { CashService } from '@main/cash/service'
import { EmployeeService } from '@main/employee/service'
import { MonthlyService } from '@main/monthly/service'
import { SettingsService } from '@main/settings/service'

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

describe('pagos pendientes en la caja', () => {
  /** Inserta una salida que quedó debiendo. */
  function seedPending(amountCop: number, plate: string): string {
    const db = manager.getNativeConnection()
    const registeredAt = new Date().toISOString()
    const vehicleId = randomUUID()
    const sessionId = randomUUID()
    const pendingId = randomUUID()
    db.prepare(
      `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
       VALUES (?, ?, 'car', 'active', ?, ?)`,
    ).run(vehicleId, plate, registeredAt, registeredAt)
    db.prepare(
      `INSERT INTO parking_sessions
       (id, vehicle_id, entered_at, exited_at, status, calculated_amount_cop, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'closed', ?, ?, ?)`,
    ).run(sessionId, vehicleId, registeredAt, registeredAt, amountCop, registeredAt, registeredAt)
    db.prepare(
      `INSERT INTO pending_payments
       (id, parking_session_id, amount_cop, status, snapshot_json, registered_at, created_at,
        updated_at)
       VALUES (?, ?, ?, 'pending', '{}', ?, ?, ?)`,
    ).run(pendingId, sessionId, amountCop, registeredAt, registeredAt, registeredAt)
    return pendingId
  }

  /** Marca un pendiente como cobrado dentro de la caja abierta. */
  function settlePending(pendingId: string): void {
    const db = manager.getNativeConnection()
    const settledAt = new Date().toISOString()
    const pending = db
      .prepare('SELECT parking_session_id, amount_cop FROM pending_payments WHERE id = ?')
      .get(pendingId) as { parking_session_id: string; amount_cop: number }
    const paymentId = randomUUID()
    db.prepare(
      `INSERT INTO payments
       (id, parking_session_id, cash_register_session_id, amount_cop, method, status, paid_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'cash', 'completed', ?, ?, ?)`,
    ).run(
      paymentId,
      pending.parking_session_id,
      cash.getOpenSessionId(),
      pending.amount_cop,
      settledAt,
      settledAt,
      settledAt,
    )
    db.prepare(
      `UPDATE pending_payments SET status = 'paid', payment_id = ?, settled_at = ? WHERE id = ?`,
    ).run(paymentId, settledAt, pendingId)
  }

  it('informa el saldo pendiente sin sumarlo ni restarlo del arqueo', () => {
    openSession()
    seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    seedPending(7_000, 'DEU001')
    seedPending(8_000, 'DEU002')

    const state = cash.getState()
    expect(state.pendingBalance).toEqual({ count: 2, totalCop: 15_000 })
    expect(state.collectedCop).toBe(10_000)
    expect(state.expectedCop).toBe(opening + 10_000)

    const summary = cash.closeSession({ closingAmountCop: opening + 10_000, notes: null })
    expect(summary).toMatchObject({
      collectedCop: 10_000,
      expectedAmountCop: opening + 10_000,
      differenceCop: 0,
      pendingBalance: { count: 2, totalCop: 15_000 },
    })
    // Sin caja abierta el saldo se sigue informando.
    expect(cash.getState().pendingBalance).toEqual({ count: 2, totalCop: 15_000 })
  })

  it('un pendiente cobrado en el turno entra a lo recaudado y deja de figurar como saldo', () => {
    openSession()
    const paid = seedPending(7_000, 'DEU001')
    seedPending(8_000, 'DEU002')
    settlePending(paid)

    const summary = cash.closeSession({ closingAmountCop: opening + 7_000, notes: null })
    expect(summary.collectedCop).toBe(7_000)
    expect(summary.pendingBalance).toEqual({ count: 1, totalCop: 8_000 })
  })

  it('el saldo de un cierre pasado no cambia cuando la deuda se cobra después', () => {
    openSession()
    const pendingId = seedPending(7_000, 'DEU001')
    const first = cash.closeSession({ closingAmountCop: opening, notes: null })
    expect(first.pendingBalance).toEqual({ count: 1, totalCop: 7_000 })

    // Se paga en el turno siguiente, y después aparece una deuda nueva.
    openSession()
    settlePending(pendingId)
    const second = cash.closeSession({ closingAmountCop: opening + 7_000, notes: null })
    seedPending(9_000, 'DEU003')

    expect(second.pendingBalance).toEqual({ count: 0, totalCop: 0 })
    // Cada cierre conserva sus propios datos aunque haya varios guardados.
    expect(cash.getCloseSummary(first.sessionId)).toMatchObject({
      sessionId: first.sessionId,
      collectedCop: 0,
      pendingBalance: { count: 1, totalCop: 7_000 },
    })
    expect(cash.getCloseSummary(second.sessionId)).toMatchObject({
      sessionId: second.sessionId,
      collectedCop: 7_000,
      pendingBalance: { count: 0, totalCop: 0 },
    })
    expect(
      cash.listClosedSessions().find((session) => session.sessionId === first.sessionId),
    ).toMatchObject({ collectedCop: 0, pendingBalance: { count: 1, totalCop: 7_000 } })
    expect(cash.getState().pendingBalance).toEqual({ count: 1, totalCop: 9_000 })
  })

  it('deja el saldo pendiente en la auditoría del cierre', () => {
    openSession()
    seedPending(7_000, 'DEU001')
    cash.closeSession({ closingAmountCop: opening, notes: null })

    const audit = manager
      .getNativeConnection()
      .prepare("SELECT details_json FROM audit_logs WHERE action = 'cash.session_closed'")
      .get() as { details_json: string }
    expect(JSON.parse(audit.details_json)).toMatchObject({ pendingCount: 1, pendingCop: 7_000 })
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

describe('ingresos por parqueo y por mensualidades', () => {
  const payMonthly = (amountCop: number): void => {
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
      amountCop,
      method: 'transfer',
      receivedCop: null,
      reference: null,
    })
  }

  it('acumula cada origen por separado y su suma es lo recaudado', () => {
    openSession()
    seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    const voided = seedParkingPayment(cash.getOpenSessionId()!, 4_000, 'XYZ999')
    payMonthly(90_000)
    cash.voidPayment({ paymentId: voided, reason: 'Cobro duplicado' })

    expect(cash.getState()).toMatchObject({
      parkingCollectedCop: 10_000,
      monthlyCollectedCop: 90_000,
      collectedCop: 100_000,
      voidedCop: 4_000,
    })

    const summary = cash.closeSession({ closingAmountCop: opening + 100_000, notes: null })
    const expected = {
      parkingCollectedCop: 10_000,
      monthlyCollectedCop: 90_000,
      collectedCop: 100_000,
      expectedAmountCop: opening + 100_000,
      differenceCop: 0,
    }
    expect(summary).toMatchObject(expected)
    expect(cash.getCloseSummary(summary.sessionId)).toMatchObject(expected)
    expect(cash.listClosedSessions()[0]).toMatchObject(expected)
  })

  it('no mezcla los orígenes de un turno con los de otro', () => {
    openSession(0)
    payMonthly(60_000)
    const first = cash.closeSession({ closingAmountCop: 60_000, notes: null })
    openSession(0)
    seedParkingPayment(cash.getOpenSessionId()!, 7_000, 'ABC123')
    const second = cash.closeSession({ closingAmountCop: 7_000, notes: null })

    expect(cash.getCloseSummary(first.sessionId)).toMatchObject({
      parkingCollectedCop: 0,
      monthlyCollectedCop: 60_000,
    })
    expect(cash.getCloseSummary(second.sessionId)).toMatchObject({
      parkingCollectedCop: 7_000,
      monthlyCollectedCop: 0,
    })
  })
})

describe('reporte del cierre', () => {
  /** Inserta un vehículo con su sesión, sin cobro asociado. */
  function seedSession(
    plate: string,
    status: 'active' | 'closed' | 'cancelled',
    amountCop: number | null,
  ): string {
    const db = manager.getNativeConnection()
    const now = new Date().toISOString()
    const vehicleId = randomUUID()
    const sessionId = randomUUID()
    db.prepare(
      `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
       VALUES (?, ?, 'motorcycle', 'active', ?, ?)`,
    ).run(vehicleId, plate, now, now)
    db.prepare(
      `INSERT INTO parking_sessions
       (id, vehicle_id, entered_at, exited_at, status, calculated_amount_cop, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, vehicleId, now, status === 'active' ? null : now, status, amountCop, now, now)
    return sessionId
  }

  it('reúne el arqueo, los vehículos del turno y los pagos de mensualidad', () => {
    const db = manager.getNativeConnection()
    openSession()
    seedParkingPayment(cash.getOpenSessionId()!, 10_000, 'ABC123')
    seedSession('GRA001', 'closed', 0)
    seedSession('ANU001', 'cancelled', 0)
    const parkedId = seedSession('DEN001', 'active', null)
    const owedId = seedSession('DEU001', 'closed', 8_000)
    const at = new Date().toISOString()
    db.prepare(
      `INSERT INTO pending_payments
       (id, parking_session_id, amount_cop, status, snapshot_json, registered_at, created_at, updated_at)
       VALUES (?, ?, 8000, 'pending', '{}', ?, ?, ?)`,
    ).run(randomUUID(), owedId, at, at, at)
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
      reference: null,
    })
    const summary = cash.closeSession({ closingAmountCop: opening + 160_000, notes: null })

    // Lo que ocurre después del cierre no cambia el reporte del turno.
    db.prepare(
      "UPDATE parking_sessions SET status = 'closed', exited_at = ?, calculated_amount_cop = 5000 WHERE id = ?",
    ).run('2999-01-01T00:00:00.000Z', parkedId)

    const report = cash.getCloseReport(summary.sessionId)
    expect(report.summary).toMatchObject({
      employeeName: 'Laura Torres',
      parkingCollectedCop: 10_000,
      monthlyCollectedCop: 150_000,
      collectedCop: 160_000,
    })
    const byPlate = new Map(report.vehicles.map((vehicle) => [vehicle.plate, vehicle]))
    expect([...byPlate.keys()].sort()).toEqual(['ABC123', 'ANU001', 'DEN001', 'DEU001', 'GRA001'])
    expect(byPlate.get('ABC123')).toMatchObject({
      outcome: 'paid',
      amountCop: 10_000,
      method: 'cash',
      receiptNumber: 1,
    })
    expect(byPlate.get('GRA001')).toMatchObject({ outcome: 'free', amountCop: 0 })
    expect(byPlate.get('ANU001')).toMatchObject({ outcome: 'cancelled', amountCop: 0 })
    expect(byPlate.get('DEN001')).toMatchObject({ outcome: 'parked', exitedAt: null, amountCop: 0 })
    expect(byPlate.get('DEU001')).toMatchObject({ outcome: 'pending', amountCop: 8_000 })
    expect(report.monthlyPayments).toEqual([
      expect.objectContaining({
        customerName: 'Carlos Andrés Peña',
        plate: 'MEN001',
        planName: 'Mensualidad automóvil',
        amountCop: 150_000,
        method: 'transfer',
        status: 'completed',
      }),
    ])

    const csv = createCashCloseCsv(report, 'Parking; "Chía"')
    expect(csv.startsWith('﻿Concepto;Placa;')).toBe(true)
    const rows = csv
      .slice(1)
      .trimEnd()
      .split('\r\n')
      .map((line) => line.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/))
    // Todas las filas tienen las mismas columnas: ninguna hoja de cálculo las desacomoda.
    expect(new Set(rows.map((row) => row.length))).toEqual(new Set([21]))
    expect(rows[0]).toEqual([
      'Concepto',
      'Placa',
      'Tipo de vehículo',
      'Fecha de ingreso',
      'Hora de ingreso',
      'Fecha de salida',
      'Hora de salida',
      'Permanencia',
      'Minutos',
      'Tarifa',
      'Estado',
      'Cobrado',
      'Anulado',
      'Pago pendiente',
      'Valor',
      'Medio de pago',
      'Recibo',
      'Fecha de cobro',
      'Hora de cobro',
      'Cliente mensual',
      'Empleado',
    ])
    const header = rows[0]!
    const record = (match: (row: string[]) => boolean): Record<string, string> =>
      Object.fromEntries(rows.find(match)!.map((value, index) => [header[index]!, value]))
    const date = /^\d{4}-\d{2}-\d{2}$/
    const time = /^\d{2}:\d{2}$/

    const paid = record((row) => row[1] === 'ABC123')
    expect(paid).toMatchObject({
      Concepto: 'Parqueo',
      'Tipo de vehículo': 'Automóvil',
      Permanencia: '0 min',
      Minutos: '0',
      Estado: 'Cobrado',
      Cobrado: 'Sí',
      Anulado: 'No',
      'Pago pendiente': 'No',
      Valor: '10000',
      'Medio de pago': 'Efectivo',
      Recibo: '1',
      Empleado: 'Laura Torres',
    })
    for (const column of ['Fecha de ingreso', 'Fecha de salida', 'Fecha de cobro']) {
      expect(paid[column]).toMatch(date)
    }
    for (const column of ['Hora de ingreso', 'Hora de salida', 'Hora de cobro']) {
      expect(paid[column]).toMatch(time)
    }
    expect(record((row) => row[1] === 'DEN001')).toMatchObject({
      'Tipo de vehículo': 'Motocicleta',
      'Fecha de salida': '',
      'Hora de salida': '',
      Permanencia: '',
      Estado: 'En el parqueadero al cierre',
      Cobrado: 'No',
      Valor: '0',
    })
    expect(record((row) => row[1] === 'DEU001')).toMatchObject({
      Estado: 'Pago pendiente',
      Cobrado: 'No',
      'Pago pendiente': 'Sí',
      Valor: '8000',
    })
    expect(record((row) => row[1] === 'ANU001')).toMatchObject({
      Estado: 'Ingreso anulado',
      Anulado: 'Sí',
    })
    expect(record((row) => row[1] === 'GRA001')).toMatchObject({ Estado: 'Sin cobro', Valor: '0' })
    expect(record((row) => row[0] === 'Mensualidad')).toMatchObject({
      Placa: 'MEN001',
      Tarifa: 'Mensualidad automóvil',
      Estado: 'Cobrado',
      Cobrado: 'Sí',
      Valor: '150000',
      'Medio de pago': 'Transferencia',
      // Las mensualidades llevan su propio consecutivo, aparte del de parqueo.
      Recibo: 'MES-00001',
      'Cliente mensual': 'Carlos Andrés Peña',
    })

    // El resumen va debajo de la tabla, tras una fila vacía, en las dos primeras columnas.
    const summaryStart = rows.findIndex((row) => row[0] === 'Resumen de la caja')
    expect(rows[summaryStart - 1]!.every((value) => value === '')).toBe(true)
    expect(summaryStart).toBe(1 + report.vehicles.length + report.monthlyPayments.length + 1)
    const resume = new Map(rows.slice(summaryStart).map((row) => [row[0], row[1]]))
    // El separador y las comillas del nombre no rompen las columnas.
    expect(resume.get('Parqueadero')).toBe('"Parking; ""Chía"""')
    expect(resume.get('Empleado a cargo')).toBe('Laura Torres')
    expect(resume.get('Ingresos por parqueo')).toBe('10000')
    expect(resume.get('Ingresos por mensualidades')).toBe('150000')
    expect(resume.get('Total recaudado')).toBe('160000')
    expect(resume.get('Vehículos del turno')).toBe('5')

    // Con configuración regional de punto decimal, las columnas se separan con coma.
    const commaCsv = createCashCloseCsv(report, 'Parking, Chía', ',')
    expect(commaCsv.startsWith('﻿Concepto,Placa,')).toBe(true)
    expect(commaCsv).toContain('Parqueadero,"Parking, Chía",')
    expect(commaCsv).not.toContain(';')
  })

  it('elige el separador según la configuración regional del equipo', () => {
    expect(csvSeparatorFor('es-CO')).toBe(';')
    expect(csvSeparatorFor('en-US')).toBe(',')
    expect(csvSeparatorFor('configuración-inválida')).toBe(';')
  })

  it('un pago pendiente de otro turno figura en la caja donde se cobró', () => {
    const db = manager.getNativeConnection()
    openSession(0)
    const first = cash.closeSession({ closingAmountCop: 0, notes: null })
    // Salió antes de que abriera la caja siguiente y se cobró en ella.
    const paymentId = seedParkingPayment(openSession(0).session!.id, 6_000, 'VIE001')
    db.prepare(
      `UPDATE parking_sessions SET entered_at = ?, exited_at = ?
       WHERE id = (SELECT parking_session_id FROM payments WHERE id = ?)`,
    ).run('2020-01-01T10:00:00.000Z', '2020-01-01T12:00:00.000Z', paymentId)
    const second = cash.closeSession({ closingAmountCop: 6_000, notes: null })

    expect(cash.getCloseReport(first.sessionId).vehicles).toEqual([])
    expect(cash.getCloseReport(second.sessionId).vehicles).toEqual([
      expect.objectContaining({
        plate: 'VIE001',
        outcome: 'paid',
        amountCop: 6_000,
        exitedAt: '2020-01-01T12:00:00.000Z',
      }),
    ])
  })

  it('neutraliza un texto que una hoja de cálculo ejecutaría como fórmula', () => {
    openSession(0)
    const summary = cash.closeSession({ closingAmountCop: 0, notes: null })
    const csv = createCashCloseCsv(cash.getCloseReport(summary.sessionId), '=HYPERLINK("x")')
    expect(csv).toContain(`Parqueadero;"'=HYPERLINK(""x"")";`)
    // Una diferencia negativa es un número propio, no texto que haya que escapar.
    expect(
      createCashCloseCsv(
        { summary: { ...summary, differenceCop: -2_000 }, vehicles: [], monthlyPayments: [] },
        null,
      ),
    ).toContain('Diferencia;-2000;')
  })

  it('rechaza exportar un cierre inexistente o una caja todavía abierta', () => {
    const open = openSession()
    for (const id of ['no-existe', open.session!.id]) {
      expect(() => cash.getCloseReport(id)).toThrow(
        expect.objectContaining({ code: 'CASH_SESSION_NOT_FOUND' }),
      )
    }
  })
})

describe('cobro simplificado', () => {
  it('exige el efectivo contado mientras el modo está desactivado', () => {
    openSession()
    expect(() => cash.closeSession({ closingAmountCop: null, notes: null })).toThrow(
      expect.objectContaining({ code: 'CLOSING_AMOUNT_REQUIRED' }),
    )
    expect(cash.getState().session).not.toBeNull()
  })

  it('cierra sin conteo ni diferencia y solo descuenta las anulaciones', () => {
    new SettingsService(manager.getNativeConnection()).update({ simpleChargeMode: true })
    openSession(0)
    const sessionId = cash.getOpenSessionId()!
    seedParkingPayment(sessionId, 10_000, 'ABC123')
    const voided = seedParkingPayment(sessionId, 5_000, 'XYZ999')
    cash.voidPayment({ paymentId: voided, reason: 'Cobro duplicado' })

    // Un valor contado que llegue de todos modos no se guarda: el modo no cuenta efectivo.
    const summary = cash.closeSession({ closingAmountCop: 3_000, notes: null })
    expect(summary).toMatchObject({
      collectedCop: 10_000,
      voidedCop: 5_000,
      expectedAmountCop: 10_000,
      closingAmountCop: null,
      differenceCop: null,
    })
    expect(cash.listClosedSessions()[0]).toMatchObject({
      expectedAmountCop: 10_000,
      closingAmountCop: null,
      differenceCop: null,
    })
  })

  it('registra un pago de mensualidad en efectivo sin efectivo recibido', () => {
    new SettingsService(manager.getNativeConnection()).update({ simpleChargeMode: true })
    openSession(0)
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
    const payment = monthly.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 150_000,
      method: 'cash',
      receivedCop: null,
      reference: null,
    })
    expect(payment).toMatchObject({ receivedCop: null, changeCop: null, balanceCop: 0 })
    expect(cash.getState().collectedCop).toBe(150_000)
  })
})
