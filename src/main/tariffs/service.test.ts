// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
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

  it('no administra ni simula desde Tarifas un plan de mensualidad', () => {
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

    expect(() => service.deletePlan('mensual-1')).toThrow(OperationError)
    expect(() => service.updatePlan({ ...draft, id: 'mensual-1' })).toThrow(OperationError)
    // Liquidar un precio mensual por horas devolvía 300.000 por dos horas.
    expect(() => service.simulate({ ratePlanId: 'mensual-1', minutes: 120 })).toThrow(
      OperationError,
    )

    const survivors = manager
      .getNativeConnection()
      .prepare("SELECT count(*) AS total FROM rate_plans WHERE id = 'mensual-1'")
      .get() as { total: number }
    expect(survivors.total).toBe(1)
    expect(service.listPlans()).toEqual([])
  })

  it('conserva los ajustes válidos cuando uno queda corrupto', () => {
    service.updateSettings({ billingUnit: 'minute', graceMinutes: 30, roundingStepCop: 500 })
    manager
      .getNativeConnection()
      .prepare("UPDATE app_settings SET value = '999' WHERE key = 'tariff.graceMinutes'")
      .run()

    const settings = service.getSettings()
    expect(settings.graceMinutes).toBe(DEFAULT_TARIFF_SETTINGS.graceMinutes)
    expect(settings.billingUnit).toBe('minute')
    expect(settings.roundingStepCop).toBe(500)
  })

  it('simula el cobro con la configuración vigente', () => {
    service.updateSettings({
      billingUnit: 'hour',
      graceMinutes: 15,
      graceFromHour: 0,
      taxEnabled: false,
    })
    const plan = service.createPlan(draft).plans[0]!

    expect(service.simulate({ ratePlanId: plan.id, minutes: 10 }).totalCop).toBe(0)
    // La tolerancia perdona la fracción final: 1 h 01 sigue cobrando una hora.
    expect(service.simulate({ ratePlanId: plan.id, minutes: 61 }).totalCop).toBe(5000)
    expect(service.simulate({ ratePlanId: plan.id, minutes: 76 }).totalCop).toBe(10_000)
  })

  it('cobra el ciclo de la plena con el umbral y la duración configurados', () => {
    service.updateSettings({
      billingUnit: 'hour',
      graceMinutes: 5,
      graceFromHour: 1,
      plenaThresholdHours: 5,
      plenaHours: 12,
      taxEnabled: false,
      roundingStepCop: 0,
    })
    const plan = service.createPlan({ ...draft, amountCop: 3500, plenaCop: 20_000 }).plans[0]!
    const total = (minutos: number) =>
      service.simulate({ ratePlanId: plan.id, minutes: minutos }).totalCop

    expect(total(5 * 60)).toBe(17_500)
    expect(total(5 * 60 + 5)).toBe(17_500)
    expect(total(5 * 60 + 6)).toBe(20_000)
    expect(total(12 * 60)).toBe(20_000)
    expect(total(12 * 60 + 6)).toBe(23_500)
    expect(total(17 * 60 + 6)).toBe(40_000)
  })

  it('rechaza un umbral que no cabe dentro de la duración de la plena', () => {
    service.updateSettings({ plenaThresholdHours: 5, plenaHours: 12 })

    expect(() => service.updateSettings({ plenaThresholdHours: 12 })).toThrow(
      expect.objectContaining({ code: 'PLENA_THRESHOLD_INVALID' }),
    )
    expect(() => service.updateSettings({ plenaHours: 4 })).toThrow(OperationError)
    expect(service.getSettings().plenaThresholdHours).toBe(5)
    expect(service.getSettings().plenaHours).toBe(12)
  })

  it('devuelve el umbral a su predeterminado cuando no cabe en la plena guardada', () => {
    service.updateSettings({ plenaThresholdHours: 20, plenaHours: 24 })
    manager
      .getNativeConnection()
      .prepare("UPDATE app_settings SET value = '12' WHERE key = 'tariff.plenaHours'")
      .run()

    const settings = service.getSettings()
    expect(settings.plenaHours).toBe(12)
    expect(settings.plenaThresholdHours).toBe(DEFAULT_TARIFF_SETTINGS.plenaThresholdHours)
  })

  it('persiste la hora desde la que arranca la tolerancia', () => {
    service.updateSettings({
      billingUnit: 'hour',
      graceMinutes: 15,
      graceFromHour: 1,
      taxEnabled: false,
    })
    const plan = service.createPlan(draft).plans[0]!

    expect(service.getSettings().graceFromHour).toBe(1)
    // La primera hora ya no tiene tolerancia; la fracción siguiente sí.
    expect(service.simulate({ ratePlanId: plan.id, minutes: 10 }).totalCop).toBe(5000)
    expect(service.simulate({ ratePlanId: plan.id, minutes: 75 }).totalCop).toBe(5000)
    expect(service.simulate({ ratePlanId: plan.id, minutes: 76 }).totalCop).toBe(10_000)
  })
})
