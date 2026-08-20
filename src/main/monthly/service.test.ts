// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { OperationError } from '@main/ipc/errors'
import { CashService } from '@main/cash/service'
import { EmployeeService } from '@main/employee/service'
import {
  coverageEndDate,
  createSubscriptionSchema,
  shiftLocalDate,
  startOfLocalDayUtc,
  todayLocalDate,
} from '@shared/monthly'
import { MonthlyService } from './service'

let directory = ''
let manager: DatabaseManager
let service: MonthlyService
let cash: CashService
let customerId = ''
let planId = ''

const today = todayLocalDate()

const filters = { search: '', status: 'all' as const }

const customerDraft = {
  fullName: 'María Fernanda Ríos',
  documentNumber: '1020304050',
  phone: '300 123 4567',
  email: 'maria@correo.com',
  notes: null,
  status: 'active' as const,
}

const subscriptionDraft = (
  overrides: Partial<Parameters<MonthlyService['createSubscription']>[0]> = {},
) => ({
  customerId,
  plate: 'MEN001',
  vehicleType: 'car' as const,
  ratePlanId: planId,
  startDate: today,
  endDate: coverageEndDate(today, 1),
  amountCop: 150_000,
  notes: null,
  ...overrides,
})

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-monthly-'))
  manager = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  manager.initialize()
  cash = new CashService(manager.getNativeConnection())
  service = new MonthlyService(manager.getNativeConnection(), cash)
  const employees = new EmployeeService(manager.getNativeConnection())
  const employeeId = employees.create({
    fullName: 'Operador de prueba',
    documentNumber: null,
    status: 'active',
  }).id
  cash.openSession({ employeeId, openingAmountCop: 0, notes: null })
  customerId = service.createCustomer(customerDraft).id
  planId = service.createPlan({
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

describe('clientes mensuales', () => {
  it('crea, edita y lista clientes con su conteo de mensualidades', () => {
    const customers = service.listCustomers()
    expect(customers).toHaveLength(1)
    expect(customers[0]).toMatchObject({
      fullName: 'María Fernanda Ríos',
      documentNumber: '1020304050',
      status: 'active',
      subscriptionCount: 0,
      activeSubscriptions: 0,
    })

    service.updateCustomer({ ...customerDraft, id: customerId, status: 'inactive' })
    expect(service.listCustomers()[0]).toMatchObject({ status: 'inactive' })
  })

  it('rechaza dos clientes con el mismo documento', () => {
    expect(() => service.createCustomer({ ...customerDraft, fullName: 'Otro cliente' })).toThrow(
      OperationError,
    )
  })

  it('no elimina un cliente que ya tiene mensualidades', () => {
    service.createSubscription(subscriptionDraft())
    expect(() => service.deleteCustomer(customerId)).toThrow(
      expect.objectContaining({ code: 'CUSTOMER_IN_USE' }),
    )
  })

  it('elimina un cliente sin historial y deja rastro de auditoría', () => {
    const disposable = service.createCustomer({
      ...customerDraft,
      fullName: 'Cliente temporal',
      documentNumber: null,
    })
    service.deleteCustomer(disposable.id)
    expect(service.listCustomers().map((customer) => customer.id)).not.toContain(disposable.id)

    const actions = manager
      .getNativeConnection()
      .prepare('SELECT action FROM audit_logs ORDER BY created_at')
      .all() as Array<{ action: string }>
    expect(actions.map((row) => row.action)).toContain('monthly.customer_deleted')
  })
})

describe('planes mensuales', () => {
  it('solo administra tarifas con unidad month', () => {
    const plans = service.listPlans()
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ billingUnit: 'month', amountCop: 150_000 })
  })

  it('no elimina un plan que ya se usó', () => {
    service.createSubscription(subscriptionDraft())
    expect(() => service.deletePlan(planId)).toThrow(
      expect.objectContaining({ code: 'MONTHLY_PLAN_IN_USE' }),
    )
  })

  it('no crea una mensualidad con un plan inactivo', () => {
    service.updatePlan({
      id: planId,
      name: 'Mensualidad automóvil',
      vehicleType: 'car',
      amountCop: 150_000,
      status: 'inactive',
    })
    expect(() => service.createSubscription(subscriptionDraft())).toThrow(
      expect.objectContaining({ code: 'MONTHLY_PLAN_INACTIVE' }),
    )
  })
})

describe('mensualidades', () => {
  it('crea la mensualidad con vigencia de días completos y vehículo reutilizable', () => {
    const subscription = service.createSubscription(subscriptionDraft())

    expect(subscription).toMatchObject({
      plate: 'MEN001',
      customerName: 'María Fernanda Ríos',
      planName: 'Mensualidad automóvil',
      amountCop: 150_000,
      paidCop: 0,
      balanceCop: 150_000,
      paymentState: 'unpaid',
      status: 'active',
    })
    expect(subscription.startsAt).toBe(startOfLocalDayUtc(today))
    expect(subscription.endsAt).toBe(startOfLocalDayUtc(coverageEndDate(today, 1), 1))

    const vehicle = manager
      .getNativeConnection()
      .prepare('SELECT plate FROM vehicles WHERE id = ?')
      .get(subscription.vehicleId) as { plate: string }
    expect(vehicle.plate).toBe('MEN001')
  })

  it('recibe la matrícula ya normalizada por el contrato de entrada', () => {
    const parsed = createSubscriptionSchema.parse(subscriptionDraft({ plate: 'men 001' }))
    expect(parsed.plate).toBe('MEN001')

    const subscription = service.createSubscription(parsed)
    expect(subscription.plate).toBe('MEN001')
  })

  it('rechaza una segunda mensualidad que se cruza con la vigente', () => {
    service.createSubscription(subscriptionDraft())
    expect(() => service.createSubscription(subscriptionDraft())).toThrow(
      expect.objectContaining({ code: 'SUBSCRIPTION_OVERLAPS' }),
    )
  })

  it('permite una mensualidad que empieza cuando termina la anterior', () => {
    const first = service.createSubscription(subscriptionDraft())
    const nextStart = shiftLocalDate(coverageEndDate(today, 1), 1)
    const second = service.createSubscription(
      subscriptionDraft({ startDate: nextStart, endDate: coverageEndDate(nextStart, 1) }),
    )

    expect(second.startsAt).toBe(first.endsAt)
    expect(second.status).toBe('pending')
  })

  it('renueva a continuación conservando cliente, vehículo y costo', () => {
    const first = service.createSubscription(subscriptionDraft())
    const renewed = service.renewSubscription({ id: first.id, months: 2, amountCop: null })

    expect(renewed.id).not.toBe(first.id)
    expect(renewed.startsAt).toBe(first.endsAt)
    expect(renewed.amountCop).toBe(150_000)
    expect(renewed.customerId).toBe(first.customerId)
    expect(renewed.vehicleId).toBe(first.vehicleId)
    expect(renewed.status).toBe('pending')
    expect(service.getOverview(filters).subscriptions).toHaveLength(2)
  })

  it('cancelar deja la mensualidad sin cobertura y registra el motivo', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    const cancelled = service.cancelSubscription({
      id: subscription.id,
      reason: 'El cliente cambió de vehículo',
    })

    expect(cancelled.status).toBe('cancelled')
    expect(
      service.findCoverageForVehicle(subscription.vehicleId, new Date().toISOString()),
    ).toBeNull()

    const audit = manager
      .getNativeConnection()
      .prepare(
        "SELECT details_json FROM audit_logs WHERE action = 'monthly.subscription_cancelled'",
      )
      .get() as { details_json: string }
    expect(JSON.parse(audit.details_json)).toMatchObject({
      reason: 'El cliente cambió de vehículo',
    })
  })

  it('sincroniza los estados guardados con el calendario', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    manager
      .getNativeConnection()
      .prepare("UPDATE monthly_subscriptions SET status = 'pending' WHERE id = ?")
      .run(subscription.id)

    const overview = service.getOverview(filters)
    expect(overview.subscriptions[0]?.status).toBe('active')

    const stored = manager
      .getNativeConnection()
      .prepare('SELECT status FROM monthly_subscriptions WHERE id = ?')
      .get(subscription.id) as { status: string }
    expect(stored.status).toBe('active')
  })

  it('filtra por matrícula, cliente y estado', () => {
    service.createSubscription(subscriptionDraft())
    expect(service.getOverview({ search: 'MEN001', status: 'all' }).subscriptions).toHaveLength(1)
    expect(service.getOverview({ search: 'María', status: 'all' }).subscriptions).toHaveLength(1)
    expect(service.getOverview({ search: 'XYZ999', status: 'all' }).subscriptions).toHaveLength(0)
    expect(service.getOverview({ search: '', status: 'expired' }).subscriptions).toHaveLength(0)
  })
})

describe('pagos de mensualidad', () => {
  it('registra un abono parcial y luego el saldo, con recibos consecutivos', () => {
    const subscription = service.createSubscription(subscriptionDraft())

    const first = service.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 50_000,
      method: 'cash',
      receivedCop: 50_000,
      reference: null,
    })
    expect(first).toMatchObject({ balanceCop: 100_000, receiptNumber: 1, changeCop: 0 })
    expect(service.getOverview(filters).subscriptions[0]).toMatchObject({
      paidCop: 50_000,
      balanceCop: 100_000,
      paymentState: 'partial',
    })

    const second = service.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 100_000,
      method: 'transfer',
      receivedCop: null,
      reference: 'TRX-9',
    })
    expect(second).toMatchObject({ balanceCop: 0, receiptNumber: 2 })
    expect(service.getOverview(filters).subscriptions[0]).toMatchObject({
      paymentState: 'paid',
      balanceCop: 0,
    })
  })

  it('rechaza un pago mayor que el saldo pendiente', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    expect(() =>
      service.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 200_000,
        method: 'cash',
        receivedCop: null,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'PAYMENT_ABOVE_BALANCE' }))
  })

  it('rechaza efectivo insuficiente y una mensualidad ya pagada', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    expect(() =>
      service.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 150_000,
        method: 'cash',
        receivedCop: 100_000,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_CASH' }))

    service.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 150_000,
      method: 'cash',
      receivedCop: 200_000,
      reference: null,
    })
    expect(() =>
      service.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 1000,
        method: 'cash',
        receivedCop: null,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSCRIPTION_ALREADY_PAID' }))
  })

  it('rechaza pagar en efectivo sin registrar el efectivo recibido', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    expect(() =>
      service.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 50_000,
        method: 'cash',
        receivedCop: null,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_CASH' }))
  })

  it('guarda un comprobante inmutable que se puede reimprimir', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    service.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 150_000,
      method: 'cash',
      receivedCop: 150_000,
      reference: null,
    })

    const snapshot = service.findReceiptSnapshot(subscription.id)
    expect(snapshot).toMatchObject({
      version: 1,
      receiptNumber: 1,
      customerName: 'María Fernanda Ríos',
      plate: 'MEN001',
      planName: 'Mensualidad automóvil',
      amountCop: 150_000,
      paidCop: 150_000,
      balanceCop: 0,
      method: 'cash',
      changeCop: 0,
    })
  })

  it('avisa cuando la mensualidad todavía no tiene comprobantes', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    expect(() => service.findReceiptSnapshot(subscription.id)).toThrow(
      expect.objectContaining({ code: 'RECEIPT_NOT_FOUND' }),
    )
  })

  it('no acepta pagos sobre una mensualidad cancelada', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    service.cancelSubscription({ id: subscription.id, reason: 'Se retiró del parqueadero' })
    expect(() =>
      service.registerPayment({
        subscriptionId: subscription.id,
        amountCop: 10_000,
        method: 'cash',
        receivedCop: null,
        reference: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }))
  })
})

describe('cobertura y resumen', () => {
  it('la cobertura respeta el intervalo semiabierto del periodo', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    const beforeStart = new Date(Date.parse(subscription.startsAt) - 1).toISOString()
    const lastInstant = new Date(Date.parse(subscription.endsAt) - 1).toISOString()

    expect(service.findCoverageForVehicle(subscription.vehicleId, beforeStart)).toBeNull()
    expect(service.findCoverageForVehicle(subscription.vehicleId, lastInstant)).toMatchObject({
      subscriptionId: subscription.id,
      customerName: 'María Fernanda Ríos',
    })
    expect(service.findCoverageForVehicle(subscription.vehicleId, subscription.endsAt)).toBeNull()
  })

  it('encuentra la cobertura por matrícula ya normalizada', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    expect(service.findCoverageByPlate('MEN001')).toMatchObject({
      subscriptionId: subscription.id,
      customerName: 'María Fernanda Ríos',
    })
    expect(service.findCoverageByPlate('ZZZ999')).toBeNull()
  })

  it('resume vigentes, saldo por cobrar y lo recaudado en el mes', () => {
    const subscription = service.createSubscription(subscriptionDraft())
    service.registerPayment({
      subscriptionId: subscription.id,
      amountCop: 50_000,
      method: 'cash',
      receivedCop: 50_000,
      reference: null,
    })

    expect(service.getOverview(filters).summary).toMatchObject({
      activeCount: 1,
      expiredCount: 0,
      pendingCollectionCop: 100_000,
      collectedThisMonthCop: 50_000,
    })
  })
})
