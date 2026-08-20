// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseManager } from '@main/database/connection'
import { OperationError } from '@main/ipc/errors'
import { TariffService } from './service'

let directory = ''
let manager: DatabaseManager
let service: TariffService

const draft = {
  name: 'Automóvil',
  vehicleType: 'car' as const,
  amountCop: 5000,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
  status: 'active' as const,
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-tariffs-'))
  manager = new DatabaseManager(path.join(directory, 'test.sqlite'), path.resolve('drizzle'))
  manager.initialize()
  service = new TariffService(manager.getNativeConnection())
})

afterEach(() => {
  manager.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('TariffService', () => {
  it('entrega la configuración predeterminada en pesos colombianos', () => {
    const configuration = service.getConfiguration()
    expect(configuration.settings).toMatchObject({
      currency: 'COP',
      billingUnit: 'hour',
      graceMinutes: 15,
      taxEnabled: false,
      taxPercent: 19,
    })
    expect(configuration.plans).toEqual([])
  })

  it('persiste los ajustes y los vuelve a leer', () => {
    service.updateSettings({ billingUnit: 'minute', graceMinutes: 10, taxEnabled: true })
    const reloaded = new TariffService(manager.getNativeConnection()).getSettings()
    expect(reloaded).toMatchObject({
      billingUnit: 'minute',
      graceMinutes: 10,
      taxEnabled: true,
      currency: 'COP',
    })
  })

  it('sincroniza la unidad de las tarifas al cambiar la unidad de cobro', () => {
    service.createPlan(draft)
    expect(service.listPlans()[0]?.billingUnit).toBe('hour')

    service.updateSettings({ billingUnit: 'minute' })
    expect(service.listPlans()[0]?.billingUnit).toBe('minute')
  })

  it('crea, edita y elimina tarifas dejando rastro de auditoría', () => {
    const created = service.createPlan(draft)
    const plan = created.plans[0]
    expect(plan).toMatchObject({ name: 'Automóvil', amountCop: 5000, graceMinutes: null })

    service.updatePlan({ ...draft, id: plan!.id, amountCop: 6000, graceMinutes: 20 })
    expect(service.listPlans()[0]).toMatchObject({ amountCop: 6000, graceMinutes: 20 })

    service.deletePlan(plan!.id)
    expect(service.listPlans()).toEqual([])

    const actions = manager
      .getNativeConnection()
      .prepare("SELECT action FROM audit_logs WHERE entity_type = 'rate_plan' ORDER BY created_at")
      .all() as Array<{ action: string }>
    expect(actions.map((row) => row.action)).toEqual([
      'tariff.plan_created',
      'tariff.plan_updated',
      'tariff.plan_deleted',
    ])
  })

  it('impide eliminar una tarifa ya utilizada', () => {
    const plan = service.createPlan(draft).plans[0]!
    const now = new Date().toISOString()
    const sqlite = manager.getNativeConnection()
    sqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES ('v1', 'ABC123', 'car', 'active', ?, ?)`,
      )
      .run(now, now)
    sqlite
      .prepare(
        `INSERT INTO parking_sessions
         (id, vehicle_id, rate_plan_id, entered_at, status, created_at, updated_at)
         VALUES ('s1', 'v1', ?, ?, 'active', ?, ?)`,
      )
      .run(plan.id, now, now, now)

    expect(() => service.deletePlan(plan.id)).toThrow(OperationError)
    expect(service.listPlans()).toHaveLength(1)
  })

  it('simula el cobro con la configuración vigente', () => {
    service.updateSettings({ billingUnit: 'hour', graceMinutes: 15, taxEnabled: false })
    const plan = service.createPlan(draft).plans[0]!

    expect(service.simulate({ ratePlanId: plan.id, minutes: 10 }).totalCop).toBe(0)
    // La tolerancia perdona la fracción final: 1 h 01 sigue cobrando una hora.
    expect(service.simulate({ ratePlanId: plan.id, minutes: 61 }).totalCop).toBe(5000)
    expect(service.simulate({ ratePlanId: plan.id, minutes: 76 }).totalCop).toBe(10_000)
  })
})
