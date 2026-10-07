// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { OperationError } from '@main/ipc/errors'
import { coverageEndDate, todayLocalDate } from '@shared/monthly'
import {
  encodeEntryTicketBarcode,
  encodeEntryTicketReference,
  encodeEntryTicketQr,
  ENTRY_TICKET_VERSION,
} from '@shared/entry-ticket'
import { CashService } from '@main/cash/service'
import { EmployeeService } from '@main/employee/service'
import { MonthlyService } from '@main/monthly/service'
import { SettingsService } from '@main/settings/service'
import { TariffService } from '@main/tariffs/service'
import { normalizeReceiptSnapshot, ParkingService, type ReceiptSnapshot } from './service'

let directory = ''
let manager: DatabaseManager
let tariffs: TariffService
let cash: CashService
let monthly: MonthlyService
let parking: ParkingService
let ratePlanId = ''

const entry = (plate = 'ABC123') => ({
  plate,
  vehicleType: 'car' as const,
  ratePlanId,
  notes: null,
})

/** Sesión activa que resuelve un código; falla si lo que hay es un pago pendiente. */
function resolveSessionId(code: string): string {
  const target = parking.resolveExitTarget(code)
  if (target.kind !== 'session') throw new Error('Se esperaba un ingreso activo')
  return target.session.id
}

/** Retrasa el ingreso de una sesión para simular permanencia sin esperar. */
function ageSession(sessionId: string, minutes: number): void {
  const enteredAt = new Date(Date.now() - minutes * 60_000).toISOString()
  manager
    .getNativeConnection()
    .prepare('UPDATE parking_sessions SET entered_at = ? WHERE id = ?')
    .run(enteredAt, sessionId)
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-parking-'))
  manager = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  manager.initialize()
  tariffs = new TariffService(manager.getNativeConnection())
  cash = new CashService(manager.getNativeConnection())
  monthly = new MonthlyService(manager.getNativeConnection(), cash)
  parking = new ParkingService(manager.getNativeConnection(), tariffs, monthly, cash)
  const employees = new EmployeeService(manager.getNativeConnection())
  const employeeId = employees.create({
    fullName: 'Operador de prueba',
    documentNumber: null,
    status: 'active',
  }).id
  cash.openSession({ employeeId, openingAmountCop: 0, notes: null })
  tariffs.updateSettings({
    billingUnit: 'hour',
    graceMinutes: 15,
    // La suite mide la tolerancia clásica, activa desde el minuto cero.
    graceFromHour: 0,
    taxEnabled: false,
    roundingStepCop: 0,
  })
  ratePlanId = tariffs.createPlan({
    name: 'Automóvil por hora',
    vehicleType: 'car',
    amountCop: 5000,
    minimumChargeCop: 0,
    plenaCop: null,
    graceMinutes: null,
    status: 'active',
  }).plans[0]!.id
})

afterEach(() => {
  manager.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('registro de ingreso', () => {
  it('crea el vehículo y la sesión activa', () => {
    const registration = parking.registerEntry(entry())
    expect(registration).toMatchObject({
      plate: 'ABC123',
      ratePlanName: 'Automóvil por hora',
      ratePlanAmountCop: 5000,
      billingUnit: 'hour',
    })
    expect(registration.graceMinutes).toBe(15)
    expect(registration.employeeName).toBe('Operador de prueba')

    const active = parking.listActiveSessions({ search: '' })
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ plate: 'ABC123', vehicleType: 'car' })
  })

  it('reconstruye el tiquete de ingreso para reimprimirlo', () => {
    const registration = parking.registerEntry({ ...entry(), notes: 'Llaves en recepción' })
    manager
      .getNativeConnection()
      .prepare('UPDATE rate_plans SET name = ?, amount_cop = ?, grace_minutes = ? WHERE id = ?')
      .run('Tarifa modificada', 9000, 30, ratePlanId)
    const reprint = parking.findEntryRegistration(registration.sessionId)
    expect(reprint).toMatchObject({
      sessionId: registration.sessionId,
      plate: 'ABC123',
      vehicleType: 'car',
      ratePlanName: 'Automóvil por hora',
      ratePlanAmountCop: 5000,
      billingUnit: 'hour',
      graceMinutes: 15,
      employeeName: 'Operador de prueba',
      notes: 'Llaves en recepción',
    })
  })

  it('resuelve el ingreso por QR, Code 128 o matrícula escrita', () => {
    const registration = parking.registerEntry(entry())
    const payload = {
      version: ENTRY_TICKET_VERSION as 1,
      sessionId: registration.sessionId,
      plate: registration.plate,
      vehicleType: registration.vehicleType,
      ratePlanId: registration.ratePlanId,
      ratePlanName: registration.ratePlanName,
      ratePlanAmountCop: registration.ratePlanAmountCop,
      billingUnit: registration.billingUnit,
      enteredAt: registration.enteredAt,
      graceMinutes: registration.graceMinutes,
      employeeName: registration.employeeName,
      notes: registration.notes,
    }

    expect(resolveSessionId(encodeEntryTicketQr(payload))).toBe(registration.sessionId)
    expect(resolveSessionId(encodeEntryTicketBarcode(registration.sessionId))).toBe(
      registration.sessionId,
    )
    expect(resolveSessionId('abc 123')).toBe(registration.sessionId)
  })

  it('resuelve el ingreso con el código numérico que imprimen el QR y el Code 128', () => {
    const registration = parking.registerEntry(entry())
    const reference = encodeEntryTicketReference(registration.sessionId)

    expect(resolveSessionId(reference)).toBe(registration.sessionId)
    // El operador puede teclearlo con los espacios del papel.
    expect(resolveSessionId(reference.replace(/(\d{4})(?=\d)/g, '$1 '))).toBe(
      registration.sessionId,
    )

    parking.cancelSession({ sessionId: registration.sessionId, reason: 'Ingreso de prueba' })
    expect(() => parking.resolveExitTarget(reference)).toThrow(
      'Ese tiquete no corresponde a ningún vehículo en el parqueadero',
    )
  })

  it('pide escanear de nuevo cuando el código llega dañado', () => {
    parking.registerEntry(entry())
    expect(() => parking.resolveExitTarget('1234567890123450')).toThrow(OperationError)
  })

  it('rechaza un QR alterado y un tiquete cuya sesión ya terminó', () => {
    const registration = parking.registerEntry(entry())
    const tampered = encodeEntryTicketQr({
      version: ENTRY_TICKET_VERSION,
      sessionId: registration.sessionId,
      plate: 'XYZ789',
      vehicleType: registration.vehicleType,
      ratePlanId: registration.ratePlanId,
      ratePlanName: registration.ratePlanName,
      ratePlanAmountCop: registration.ratePlanAmountCop,
      billingUnit: registration.billingUnit,
      enteredAt: registration.enteredAt,
      graceMinutes: registration.graceMinutes,
      employeeName: registration.employeeName,
      notes: registration.notes,
    })
    expect(() => parking.resolveExitTarget(tampered)).toThrow(OperationError)

    parking.cancelSession({
      sessionId: registration.sessionId,
      reason: 'Ingreso de prueba terminado',
    })
    expect(() =>
      parking.resolveExitTarget(encodeEntryTicketBarcode(registration.sessionId)),
    ).toThrow(OperationError)
  })

  it('explica el reloj atrasado en lugar de fallar sin motivo al cotizar', () => {
    const registration = parking.registerEntry(entry())
    // El reloj del equipo retrocede por debajo de la hora de ingreso.
    ageSession(registration.sessionId, -120)

    const failure = (): unknown => parking.quoteExit(registration.sessionId)
    expect(failure).toThrow(OperationError)
    expect(failure).toThrow(/hora del equipo es anterior/)
  })

  it('rechaza cobrar un ingreso con una tarifa de mensualidad', () => {
    const now = new Date().toISOString()
    manager
      .getNativeConnection()
      .prepare(
        `INSERT INTO rate_plans
         (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop, plena_cop,
          grace_minutes, status, created_at, updated_at)
         VALUES ('mensual-1', 'Mensualidad automóvil', 'car', 'month', 150000, 0, NULL, NULL,
                 'active', ?, ?)`,
      )
      .run(now, now)

    expect(() => parking.registerEntry({ ...entry(), ratePlanId: 'mensual-1' })).toThrow(
      OperationError,
    )
    expect(parking.listActiveSessions({ search: '' })).toEqual([])
  })

  it('no reimprime el tiquete de una sesión cerrada ni de una anulada', () => {
    const closed = parking.registerEntry(entry())
    parking.closeSession({
      sessionId: closed.sessionId,
      expectedTotalCop: 0,
      method: 'cash',
      receivedCop: null,
      notes: null,
    })
    expect(() => parking.findEntryRegistration(closed.sessionId)).toThrow(OperationError)

    const cancelled = parking.registerEntry(entry('XYZ789'))
    parking.cancelSession({
      sessionId: cancelled.sessionId,
      reason: 'Matrícula digitada por error',
    })
    expect(() => parking.findEntryRegistration(cancelled.sessionId)).toThrow(OperationError)
  })

  it('normaliza la matrícula y reutiliza el vehículo entre visitas', () => {
    const first = parking.registerEntry(entry())
    parking.closeSession({
      sessionId: first.sessionId,
      expectedTotalCop: 0,
      method: 'cash',
      receivedCop: null,
      notes: null,
    })
    parking.registerEntry(entry())

    const vehicles = manager
      .getNativeConnection()
      .prepare('SELECT count(*) AS total FROM vehicles')
      .get() as { total: number }
    expect(vehicles.total).toBe(1)
  })

  it('impide dos ingresos activos para la misma matrícula', () => {
    parking.registerEntry(entry())
    expect(() => parking.registerEntry(entry())).toThrow(OperationError)
  })

  it('rechaza una tarifa inactiva', () => {
    const inactive = tariffs
      .createPlan({
        name: 'Bicicleta',
        vehicleType: 'bicycle',
        amountCop: 1000,
        minimumChargeCop: 0,
        plenaCop: null,
        graceMinutes: null,
        status: 'inactive',
      })
      .plans.find((plan) => plan.name === 'Bicicleta')!
    expect(() =>
      parking.registerEntry({
        plate: 'BIC001',
        vehicleType: 'bicycle',
        ratePlanId: inactive.id,
        notes: null,
      }),
    ).toThrow(OperationError)
  })

  it('acepta motocicletas y bicicletas con su propia tarifa', () => {
    const motorcyclePlan = tariffs
      .createPlan({
        name: 'Motocicleta por hora',
        vehicleType: 'motorcycle',
        amountCop: 2500,
        minimumChargeCop: 0,
        plenaCop: null,
        graceMinutes: null,
        status: 'active',
      })
      .plans.find((plan) => plan.name === 'Motocicleta por hora')!

    parking.registerEntry({
      plate: 'MOT77',
      vehicleType: 'motorcycle',
      ratePlanId: motorcyclePlan.id,
      notes: 'Casco en recepción',
    })
    const active = parking.listActiveSessions({ search: 'mot' })
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      plate: 'MOT77',
      vehicleType: 'motorcycle',
      notes: 'Casco en recepción',
    })
  })
})

describe('cotización y salida', () => {
  it('cotiza el cobro con el tiempo transcurrido', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)

    const quote = parking.quoteExit(registration.sessionId)
    expect(quote.charge.billedUnits).toBe(2)
    expect(quote.charge.totalCop).toBe(10_000)
  })

  it('registra pago, recibo y cierre en una sola transacción', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    const total = parking.quoteExit(registration.sessionId).charge.totalCop

    const exit = parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop: total,
      method: 'cash',
      receivedCop: 20_000,
      notes: null,
    })

    expect(exit).toMatchObject({ receiptNumber: 1, changeCop: 10_000, method: 'cash' })
    expect(parking.listActiveSessions({ search: '' })).toEqual([])

    const sqlite = manager.getNativeConnection()
    const session = sqlite
      .prepare('SELECT status, calculated_amount_cop FROM parking_sessions WHERE id = ?')
      .get(registration.sessionId) as { status: string; calculated_amount_cop: number }
    expect(session).toMatchObject({ status: 'closed', calculated_amount_cop: 10_000 })

    const payment = sqlite
      .prepare('SELECT amount_cop, method, status FROM payments WHERE parking_session_id = ?')
      .get(registration.sessionId) as { amount_cop: number; method: string; status: string }
    expect(payment).toMatchObject({ amount_cop: 10_000, method: 'cash', status: 'completed' })

    const snapshot = parking.findReceiptSnapshot(registration.sessionId)
    expect(snapshot).toMatchObject({
      version: 3,
      plate: 'ABC123',
      receiptNumber: 1,
      employeeName: 'Operador de prueba',
    })
    expect(snapshot.charge.totalCop).toBe(10_000)
  })

  it('rechaza cobrar un total distinto al confirmado', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    expect(() =>
      parking.closeSession({
        sessionId: registration.sessionId,
        expectedTotalCop: 5000,
        method: 'cash',
        receivedCop: null,
        notes: null,
      }),
    ).toThrow(OperationError)
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)
  })

  it('rechaza efectivo insuficiente sin cerrar la sesión', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    expect(() =>
      parking.closeSession({
        sessionId: registration.sessionId,
        expectedTotalCop: 10_000,
        method: 'cash',
        receivedCop: 5000,
        notes: null,
      }),
    ).toThrow(OperationError)
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)
  })

  it('rechaza cobrar en efectivo sin registrar el efectivo recibido', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    expect(() =>
      parking.closeSession({
        sessionId: registration.sessionId,
        expectedTotalCop: 10_000,
        method: 'cash',
        receivedCop: null,
        notes: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_CASH' }))
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)
  })

  it('cierra sin pago ni recibo cuando la salida ocurre dentro de la gracia', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 5)

    const exit = parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop: 0,
      method: 'cash',
      receivedCop: null,
      notes: null,
    })

    expect(exit.receiptNumber).toBeNull()
    expect(exit.charge.withinGrace).toBe(true)
    const payments = manager
      .getNativeConnection()
      .prepare('SELECT count(*) AS total FROM payments')
      .get() as { total: number }
    expect(payments.total).toBe(0)
    expect(() => parking.findReceiptSnapshot(registration.sessionId)).toThrow(OperationError)
  })

  it('cobra la primera hora completa cuando la tolerancia arranca en la hora 1', () => {
    tariffs.updateSettings({ graceFromHour: 1 })
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 5)

    const exit = parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop: 5000,
      method: 'cash',
      receivedCop: 5000,
      notes: null,
    })

    expect(exit.charge.withinGrace).toBe(false)
    expect(exit.charge.billedUnits).toBe(1)
    expect(exit.charge.totalCop).toBe(5000)
    expect(exit.receiptNumber).not.toBeNull()
  })

  it('numera los recibos de forma consecutiva', () => {
    const numbers: Array<number | null> = []
    for (const plate of ['AAA111', 'BBB222']) {
      const registration = parking.registerEntry(entry(plate))
      ageSession(registration.sessionId, 90)
      numbers.push(
        parking.closeSession({
          sessionId: registration.sessionId,
          expectedTotalCop: 10_000,
          method: 'card',
          receivedCop: null,
          notes: null,
        }).receiptNumber,
      )
    }
    expect(numbers).toEqual([1, 2])
  })
})

describe('anulación', () => {
  it('anula la sesión, libera la matrícula y deja auditoría', () => {
    const registration = parking.registerEntry(entry())
    const remaining = parking.cancelSession({
      sessionId: registration.sessionId,
      reason: 'Matrícula digitada por error',
    })
    expect(remaining).toEqual([])

    parking.registerEntry(entry())
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)

    const actions = manager
      .getNativeConnection()
      .prepare("SELECT action FROM audit_logs WHERE action LIKE 'parking%' ORDER BY created_at")
      .all() as Array<{ action: string }>
    expect(actions.map((row) => row.action)).toEqual([
      'parking.entry_registered',
      'parking.entry_cancelled',
      'parking.entry_registered',
    ])
  })
})

describe('recibo persistido', () => {
  it('completa un recibo antiguo sin plenas al reimprimirlo', () => {
    const legacy = {
      version: 1,
      charge: { billedUnits: 3, totalCop: 15_000 },
    } as unknown as ReceiptSnapshot
    const normalized = normalizeReceiptSnapshot(legacy)
    expect(normalized.charge.plenaCount).toBe(0)
    expect(normalized.charge.plenaUnitCop).toBe(0)
    expect(normalized.charge.chargedUnits).toBe(3)
  })

  it('no atribuye a nadie un recibo anterior al empleado del turno', () => {
    const legacy = {
      version: 2,
      charge: { billedUnits: 3, chargedUnits: 3, plenaCount: 0, plenaUnitCop: 0, totalCop: 15_000 },
    } as unknown as ReceiptSnapshot
    expect(normalizeReceiptSnapshot(legacy).employeeName).toBeNull()
  })

  it('conserva el desglose del IVA vigente al cobrar', () => {
    tariffs.updateSettings({ taxEnabled: true, taxPercent: 19, taxIncludedInPrice: true })
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop: 10_000,
      method: 'transfer',
      receivedCop: null,
      notes: null,
    })

    const snapshot: ReceiptSnapshot = parking.findReceiptSnapshot(registration.sessionId)
    expect(snapshot.charge.taxPercent).toBe(19)
    expect(snapshot.charge.subtotalCop + snapshot.charge.taxCop).toBe(10_000)
  })
})

describe('historial de salidas', () => {
  /** Cierra una sesión con la permanencia indicada y devuelve su identificador. */
  const closeWith = (plate: string, minutes: number, expectedTotalCop: number): string => {
    const registration = parking.registerEntry(entry(plate))
    ageSession(registration.sessionId, minutes)
    parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop,
      method: 'cash',
      receivedCop: expectedTotalCop,
      notes: null,
    })
    return registration.sessionId
  }

  it('lista las salidas de la más reciente a la más antigua con sus totales', () => {
    closeWith('AAA111', 90, 10_000)
    closeWith('BBB222', 90, 10_000)

    const history = parking.listExits({ search: '', from: '', to: '', limit: 50 })
    expect(history.records.map((record) => record.plate)).toEqual(['BBB222', 'AAA111'])
    expect(history.totalCount).toBe(2)
    expect(history.totalCollectedCop).toBe(20_000)
    expect(history.records[0]).toMatchObject({
      status: 'closed',
      method: 'cash',
      totalCop: 10_000,
      totalMinutes: 90,
    })
    expect(history.records[0]?.charge?.billedUnits).toBe(2)
  })

  it('filtra por matrícula sin perder el total del filtro', () => {
    closeWith('AAA111', 90, 10_000)
    closeWith('BBB222', 90, 10_000)

    const history = parking.listExits({ search: 'bbb', from: '', to: '', limit: 50 })
    expect(history.records).toHaveLength(1)
    expect(history.totalCount).toBe(1)
    expect(history.totalCollectedCop).toBe(10_000)
  })

  it('incluye las salidas sin cobro y las sesiones anuladas', () => {
    closeWith('CCC333', 5, 0)
    const cancelled = parking.registerEntry(entry('DDD444'))
    parking.cancelSession({ sessionId: cancelled.sessionId, reason: 'Placa mal digitada' })

    const history = parking.listExits({ search: '', from: '', to: '', limit: 50 })
    expect(history.totalCount).toBe(2)
    expect(history.totalCollectedCop).toBe(0)
    const anulada = history.records.find((record) => record.plate === 'DDD444')
    expect(anulada).toMatchObject({ status: 'cancelled', receiptNumber: null, totalCop: 0 })
    const gracia = history.records.find((record) => record.plate === 'CCC333')
    expect(gracia).toMatchObject({ status: 'closed', receiptNumber: null, totalCop: 0 })
  })

  it('respeta el límite de página conservando el total real', () => {
    closeWith('AAA111', 90, 10_000)
    closeWith('BBB222', 90, 10_000)
    closeWith('CCC333', 90, 10_000)

    const history = parking.listExits({ search: '', from: '', to: '', limit: 2 })
    expect(history.records).toHaveLength(2)
    expect(history.totalCount).toBe(3)
    expect(history.totalCollectedCop).toBe(30_000)
  })

  it('acota por rango de fechas locales', () => {
    closeWith('AAA111', 90, 10_000)
    const today = new Date()
    const iso = (date: Date): string =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const tomorrow = new Date(today.getTime() + 86_400_000)

    expect(
      parking.listExits({ search: '', from: iso(today), to: iso(today), limit: 50 }).totalCount,
    ).toBe(1)
    expect(
      parking.listExits({ search: '', from: iso(tomorrow), to: iso(tomorrow), limit: 50 })
        .totalCount,
    ).toBe(0)
  })
})

describe('exención por mensualidad', () => {
  /** Deja la matrícula con una mensualidad vigente desde hoy. */
  function subscribe(plate: string): void {
    const customerId = monthly.createCustomer({
      fullName: 'Cliente mensual',
      documentNumber: null,
      phone: null,
      email: null,
      notes: null,
      status: 'active',
    }).id
    const planId = monthly.createPlan({
      name: 'Mensualidad automóvil',
      vehicleType: 'car',
      amountCop: 150_000,
      status: 'active',
    }).id
    const today = todayLocalDate()
    monthly.createSubscription({
      customerId,
      plate,
      vehicleType: 'car',
      ratePlanId: planId,
      startDate: today,
      endDate: coverageEndDate(today, 1),
      amountCop: 150_000,
      notes: null,
    })
  }

  it('conserva la salida sin cobro y el historial al eliminar al cliente y su plan mensual', () => {
    subscribe('MEN001')
    const subscription = monthly.getOverview({ search: '', status: 'all' }).subscriptions[0]!
    monthly.deleteCustomer(subscription.customerId)
    monthly.deletePlan(subscription.ratePlanId)
    const registered = parking.registerEntry(entry('MEN001'))
    ageSession(registered.sessionId, 90)
    expect(parking.quoteExit(registered.sessionId).charge.totalCop).toBe(0)
    const exit = parking.closeSession({
      sessionId: registered.sessionId,
      expectedTotalCop: 0,
      method: 'cash',
      receivedCop: null,
      notes: null,
    })
    expect(exit.monthlyCoverage?.subscriptionId).toBe(subscription.id)
    const history = parking.listExits({ search: 'MEN001', from: '', to: '', limit: 50 })
    expect(history.records[0]?.monthlyCustomerName).toBe('Cliente mensual')
    expect(history.totalCollectedCop).toBe(0)
  })

  it('cotiza en cero y muestra la mensualidad en el parqueo activo', () => {
    subscribe('MEN001')
    const registered = parking.registerEntry(entry('MEN001'))
    ageSession(registered.sessionId, 300)

    const quote = parking.quoteExit(registered.sessionId)
    expect(quote.charge.totalCop).toBe(0)
    expect(quote.charge.totalMinutes).toBe(300)
    expect(quote.session.monthlyCoverage).toMatchObject({ customerName: 'Cliente mensual' })

    const [active] = parking.listActiveSessions({ search: '' })
    expect(active?.monthlyCoverage).not.toBeNull()
  })

  it('cierra la salida sin pago ni recibo y deja el vínculo con la mensualidad', () => {
    subscribe('MEN001')
    const registered = parking.registerEntry(entry('MEN001'))
    ageSession(registered.sessionId, 600)

    const exit = parking.closeSession({
      sessionId: registered.sessionId,
      expectedTotalCop: 0,
      method: 'cash',
      receivedCop: null,
      notes: null,
    })

    expect(exit.charge.totalCop).toBe(0)
    expect(exit.receiptNumber).toBeNull()
    expect(exit.monthlyCoverage).not.toBeNull()

    const payments = manager
      .getNativeConnection()
      .prepare('SELECT count(*) AS total FROM payments WHERE parking_session_id = ?')
      .get(registered.sessionId) as { total: number }
    expect(payments.total).toBe(0)

    const history = parking.listExits({ search: 'MEN001', from: '', to: '', limit: 10 })
    expect(history.records[0]).toMatchObject({
      totalCop: 0,
      receiptNumber: null,
      monthlyCustomerName: 'Cliente mensual',
    })
  })

  it('vuelve a cobrar por horas cuando la mensualidad se cancela', () => {
    subscribe('MEN001')
    const subscriptionId = monthly.getOverview({ search: '', status: 'all' }).subscriptions[0]!.id
    monthly.cancelSubscription({ id: subscriptionId, reason: 'El cliente se retiró' })

    const registered = parking.registerEntry(entry('MEN001'))
    ageSession(registered.sessionId, 120)

    expect(parking.quoteExit(registered.sessionId).charge.totalCop).toBe(10_000)
  })

  it('un vehículo sin mensualidad sigue cobrándose por tiempo', () => {
    subscribe('MEN001')
    const registered = parking.registerEntry(entry('OTR999'))
    ageSession(registered.sessionId, 120)

    const quote = parking.quoteExit(registered.sessionId)
    expect(quote.session.monthlyCoverage).toBeNull()
    expect(quote.charge.totalCop).toBe(10_000)
  })
})

describe('pago pendiente', () => {
  /** Ingresa un vehículo, lo deja salir debiendo y devuelve el pendiente. */
  const leavePending = (plate = 'ABC123', minutes = 90) => {
    const registration = parking.registerEntry(entry(plate))
    ageSession(registration.sessionId, minutes)
    const total = parking.quoteExit(registration.sessionId).charge.totalCop
    return parking.markPaymentPending({
      sessionId: registration.sessionId,
      expectedTotalCop: total,
    })
  }

  it('recupera para imprimir el snapshot exacto de cada deuda sin generar cobros ni reabrir sesiones', () => {
    const first = leavePending('ABC123', 90)
    const second = leavePending('ABC123', 150)
    manager
      .getNativeConnection()
      .prepare("UPDATE rate_plans SET name = 'Tarifa nueva', amount_cop = 90000 WHERE id = ?")
      .run(ratePlanId)
    cash.closeSession({ closingAmountCop: 0, notes: null })
    expect(parking.findPendingPayment(first.id)).toEqual(first)
    expect(parking.findPendingPayment(second.id)).toEqual(second)
    expect(first.amountCop).not.toBe(second.amountCop)
    expect(parking.resolveExitTarget(encodeEntryTicketReference(first.sessionId)).kind).toBe(
      'pending',
    )
    expect(parking.listActiveSessions({ search: '' })).toEqual([])
    expect(
      manager.getNativeConnection().prepare('SELECT COUNT(*) AS total FROM payments').get(),
    ).toEqual({ total: 0 })
    expect(
      manager.getNativeConnection().prepare('SELECT COUNT(*) AS total FROM receipts').get(),
    ).toEqual({ total: 0 })
  })

  it('rechaza imprimir pendientes cobrados o inexistentes y mantiene restringido el tiquete de ingreso', () => {
    const pending = leavePending()
    expect(() => parking.findEntryRegistration(pending.sessionId)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_ACTIVE' }),
    )
    parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: pending.amountCop,
    })
    for (const id of [pending.id, 'missing']) {
      expect(() => parking.findPendingPayment(id)).toThrow(
        expect.objectContaining({ code: 'PENDING_PAYMENT_NOT_FOUND' }),
      )
    }
  })

  it('detiene la permanencia, cierra la sesión y no genera pago ni recibo', () => {
    const pending = leavePending()

    expect(pending).toMatchObject({
      plate: 'ABC123',
      amountCop: 10_000,
      employeeName: 'Operador de prueba',
    })
    expect(pending.charge.totalMinutes).toBe(90)
    expect(parking.listActiveSessions({ search: '' })).toEqual([])
    expect(parking.listPendingPayments()).toEqual([pending])

    const sqlite = manager.getNativeConnection()
    const session = sqlite
      .prepare('SELECT status, exited_at, calculated_amount_cop FROM parking_sessions WHERE id = ?')
      .get(pending.sessionId) as {
      status: string
      exited_at: string
      calculated_amount_cop: number
    }
    expect(session).toEqual({
      status: 'closed',
      exited_at: pending.exitedAt,
      calculated_amount_cop: 10_000,
    })
    const payments = sqlite.prepare('SELECT count(*) AS total FROM payments').get() as {
      total: number
    }
    expect(payments.total).toBe(0)
    expect(cash.getState().collectedCop).toBe(0)
    expect(() => parking.findReceiptSnapshot(pending.sessionId)).toThrow(
      expect.objectContaining({ code: 'RECEIPT_NOT_FOUND' }),
    )
  })

  it('el importe no cambia aunque pase el tiempo o cambie la tarifa', () => {
    const pending = leavePending()
    manager
      .getNativeConnection()
      .prepare('UPDATE rate_plans SET amount_cop = 90000 WHERE id = ?')
      .run(ratePlanId)

    expect(parking.listPendingPayments()[0]).toMatchObject({
      id: pending.id,
      amountCop: 10_000,
      ratePlanName: 'Automóvil por hora',
    })
  })

  it('rechaza un total distinto al confirmado y una salida sin cobro', () => {
    const registration = parking.registerEntry(entry())
    // Dentro de la gracia no hay nada que deber.
    expect(() =>
      parking.markPaymentPending({ sessionId: registration.sessionId, expectedTotalCop: 0 }),
    ).toThrow(expect.objectContaining({ code: 'NOTHING_TO_COLLECT' }))

    ageSession(registration.sessionId, 90)
    expect(() =>
      parking.markPaymentPending({ sessionId: registration.sessionId, expectedTotalCop: 5000 }),
    ).toThrow(expect.objectContaining({ code: 'CHARGE_CHANGED' }))
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)
    expect(parking.listPendingPayments()).toEqual([])
  })

  it('no exige caja abierta, igual que una salida sin cobro', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    cash.closeSession({ closingAmountCop: 0, notes: null })

    const pending = parking.markPaymentPending({
      sessionId: registration.sessionId,
      expectedTotalCop: 10_000,
    })
    expect(pending).toMatchObject({ amountCop: 10_000, employeeName: null })
  })

  it('permite un nuevo ingreso y acumula pendientes independientes', () => {
    const first = leavePending('ABC123', 90)
    const second = leavePending('ABC123', 150)
    const other = leavePending('XYZ789', 30)

    expect(second.sessionId).not.toBe(first.sessionId)
    expect(parking.listPendingPayments().map((pending) => pending.id)).toEqual([
      other.id,
      second.id,
      first.id,
    ])

    // Un tercer ingreso sigue activo mientras las dos deudas anteriores esperan.
    const third = parking.registerEntry(entry('ABC123'))
    expect(resolveSessionId('ABC123')).toBe(third.sessionId)

    const paid = parking.settlePendingPayment({
      pendingPaymentId: first.id,
      method: 'cash',
      receivedCop: 10_000,
    })
    expect(paid).toMatchObject({ sessionId: first.sessionId, receiptNumber: 1, changeCop: 0 })
    // Cobrar uno no toca ni el otro pendiente ni el ingreso activo.
    expect(parking.listPendingPayments().map((pending) => pending.id)).toEqual([
      other.id,
      second.id,
    ])
    expect(parking.listActiveSessions({ search: '' })).toHaveLength(1)
  })

  it('avisa del pendiente al escribir la matrícula o leer el tiquete viejo', () => {
    const pending = leavePending()

    for (const code of [
      'abc 123',
      encodeEntryTicketReference(pending.sessionId),
      encodeEntryTicketBarcode(pending.sessionId),
    ]) {
      expect(parking.resolveExitTarget(code)).toEqual({
        kind: 'pending',
        plate: 'ABC123',
        pendingPayments: [pending],
      })
    }

    // Cobrado el pendiente, el tiquete viejo vuelve a ser uno ya usado.
    parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'card',
      receivedCop: null,
    })
    expect(() => parking.resolveExitTarget(encodeEntryTicketReference(pending.sessionId))).toThrow(
      'Ese tiquete no corresponde a ningún vehículo en el parqueadero',
    )
    expect(() => parking.resolveExitTarget('ABC123')).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    )
  })

  it('cobra el pendiente con pago, recibo y entrada a la caja abierta', () => {
    const pending = leavePending()

    const exit = parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: 20_000,
    })

    expect(exit).toMatchObject({
      sessionId: pending.sessionId,
      plate: 'ABC123',
      exitedAt: pending.exitedAt,
      receiptNumber: 1,
      receivedCop: 20_000,
      changeCop: 10_000,
    })
    expect(parking.listPendingPayments()).toEqual([])
    expect(cash.getState().collectedCop).toBe(10_000)

    const snapshot = parking.findReceiptSnapshot(pending.sessionId)
    expect(snapshot).toMatchObject({
      receiptNumber: 1,
      enteredAt: pending.enteredAt,
      exitedAt: pending.exitedAt,
      employeeName: 'Operador de prueba',
    })
    expect(snapshot.charge).toEqual(pending.charge)

    expect(() =>
      parking.settlePendingPayment({
        pendingPaymentId: pending.id,
        method: 'cash',
        receivedCop: 20_000,
      }),
    ).toThrow(expect.objectContaining({ code: 'PENDING_PAYMENT_NOT_FOUND' }))
  })

  it('rechaza cobrar el pendiente sin caja o con efectivo insuficiente', () => {
    const pending = leavePending()

    expect(() =>
      parking.settlePendingPayment({
        pendingPaymentId: pending.id,
        method: 'cash',
        receivedCop: 5000,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_CASH' }))
    expect(() =>
      parking.settlePendingPayment({
        pendingPaymentId: pending.id,
        method: 'cash',
        receivedCop: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_CASH' }))

    cash.closeSession({ closingAmountCop: 0, notes: null })
    expect(() =>
      parking.settlePendingPayment({
        pendingPaymentId: pending.id,
        method: 'card',
        receivedCop: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'NO_CASH_SESSION' }))
    expect(parking.listPendingPayments()).toHaveLength(1)
  })

  it('con el cobro simplificado cobra el pendiente sin efectivo recibido', () => {
    const pending = leavePending()
    new SettingsService(manager.getNativeConnection()).update({ simpleChargeMode: true })

    const exit = parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: null,
    })
    expect(exit).toMatchObject({ receivedCop: null, changeCop: null, receiptNumber: 1 })
  })

  it('el historial lo marca pendiente hasta que se cobra', () => {
    const pending = leavePending()

    const before = parking.listExits({ search: '', from: '', to: '', limit: 10 })
    expect(before.records[0]).toMatchObject({
      sessionId: pending.sessionId,
      paymentPending: true,
      totalCop: 10_000,
      totalMinutes: 90,
      receiptNumber: null,
    })
    expect(before.records[0]?.charge).toEqual(pending.charge)
    expect(before.totalCollectedCop).toBe(0)

    parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: 10_000,
    })
    const after = parking.listExits({ search: '', from: '', to: '', limit: 10 })
    expect(after.records[0]).toMatchObject({ paymentPending: false, receiptNumber: 1 })
    expect(after.totalCollectedCop).toBe(10_000)
  })

  it('anular el cobro de un pendiente lo anula por completo, sin devolverlo al listado', () => {
    const pending = leavePending()
    parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: 10_000,
    })
    const paymentId = cash.getState().movements[0]!.paymentId

    const state = cash.voidPayment({ paymentId, reason: 'El cliente no debía ese cobro' })

    expect(state.collectedCop).toBe(0)
    expect(state.voidedCop).toBe(10_000)
    expect(state.pendingBalance).toEqual({ count: 0, totalCop: 0 })
    expect(parking.listPendingPayments()).toEqual([])
    expect(parking.listActiveSessions({ search: '' })).toEqual([])
    // Ni la matrícula ni el tiquete viejo vuelven a avisar de una deuda.
    expect(() => parking.resolveExitTarget(pending.plate)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    )
    expect(() => parking.resolveExitTarget(encodeEntryTicketReference(pending.sessionId))).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_ACTIVE' }),
    )

    // La deuda anulada ya no se puede cobrar ni reimprimir.
    expect(() =>
      parking.settlePendingPayment({
        pendingPaymentId: pending.id,
        method: 'card',
        receivedCop: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'PENDING_PAYMENT_NOT_FOUND' }))
    expect(() => parking.findPendingPayment(pending.id)).toThrow(
      expect.objectContaining({ code: 'PENDING_PAYMENT_NOT_FOUND' }),
    )

    // El historial deja de marcarla pendiente y no suma el importe anulado.
    const history = parking.listExits({ search: '', from: '', to: '', limit: 10 })
    expect(history.records[0]).toMatchObject({
      sessionId: pending.sessionId,
      paymentPending: false,
      receiptNumber: null,
    })
    expect(history.totalCollectedCop).toBe(0)
  })

  it('el vehículo puede volver a ingresar sin aviso de deuda tras anular el cobro', () => {
    const pending = leavePending()
    parking.settlePendingPayment({
      pendingPaymentId: pending.id,
      method: 'cash',
      receivedCop: 10_000,
    })
    cash.voidPayment({
      paymentId: cash.getState().movements[0]!.paymentId,
      reason: 'El cliente no debía ese cobro',
    })

    parking.registerEntry(entry(pending.plate))
    expect(parking.resolveExitTarget(pending.plate).kind).toBe('session')
  })
})

describe('caja obligatoria', () => {
  it('rechaza registrar un ingreso sin caja abierta', () => {
    cash.closeSession({ closingAmountCop: 0, notes: null })
    expect(() => parking.registerEntry(entry())).toThrow(
      expect.objectContaining({ code: 'NO_CASH_SESSION' }),
    )
  })

  it('rechaza cobrar una salida sin caja abierta', () => {
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 120)
    const quote = parking.quoteExit(registration.sessionId)

    cash.closeSession({ closingAmountCop: 0, notes: null })
    expect(() =>
      parking.closeSession({
        sessionId: registration.sessionId,
        expectedTotalCop: quote.charge.totalCop,
        method: 'cash',
        receivedCop: null,
        notes: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'NO_CASH_SESSION' }))
  })
})

describe('cobro simplificado', () => {
  it('cobra la salida en efectivo sin efectivo recibido ni cambio', () => {
    new SettingsService(manager.getNativeConnection()).update({ simpleChargeMode: true })
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)

    const exit = parking.closeSession({
      sessionId: registration.sessionId,
      expectedTotalCop: 10_000,
      method: 'cash',
      // Aunque llegue un valor, el modo no registra efectivo recibido.
      receivedCop: 50_000,
      notes: null,
    })

    expect(exit).toMatchObject({ receivedCop: null, changeCop: null })
    expect(exit.receiptNumber).not.toBeNull()
    expect(parking.findReceiptSnapshot(registration.sessionId)).toMatchObject({
      receivedCop: null,
      changeCop: null,
    })
    expect(cash.getState().collectedCop).toBe(10_000)
  })

  it('sigue exigiendo caja abierta y el total confirmado', () => {
    new SettingsService(manager.getNativeConnection()).update({ simpleChargeMode: true })
    const registration = parking.registerEntry(entry())
    ageSession(registration.sessionId, 90)
    expect(() =>
      parking.closeSession({
        sessionId: registration.sessionId,
        expectedTotalCop: 5000,
        method: 'cash',
        receivedCop: null,
        notes: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'CHARGE_CHANGED' }))
  })
})
