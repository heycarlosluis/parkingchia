// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VEHICLE_TYPES } from '@shared/tariff'
import { DatabaseManager } from './connection'

let directory = ''

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-migration-'))
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

/** Reconstruye la carpeta de migraciones truncada hasta `lastIndex` inclusive. */
function migrationsUpTo(lastIndex: number): string {
  const source = path.resolve('drizzle')
  const target = path.join(directory, `drizzle-${lastIndex}`)
  fs.mkdirSync(path.join(target, 'meta'), { recursive: true })

  const journal = JSON.parse(
    fs.readFileSync(path.join(source, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string }> }
  const entries = journal.entries.filter((entry) => entry.idx <= lastIndex)

  for (const entry of entries) {
    fs.copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(target, `${entry.tag}.sql`))
  }
  fs.writeFileSync(
    path.join(target, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  )
  return target
}

describe('actualización del esquema de tarifas', () => {
  it('conserva las tarifas existentes y aplica los valores nuevos', () => {
    const databasePath = path.join(directory, 'test.sqlite')
    const now = new Date().toISOString()

    const legacy = new DatabaseManager(databasePath, migrationsUpTo(0))
    legacy.initialize()
    legacy
      .getNativeConnection()
      .prepare(
        `INSERT INTO rate_plans
         (id, name, vehicle_type, billing_unit, amount_cop, grace_minutes, status, created_at, updated_at)
         VALUES ('legacy-car', 'Automóvil por hora', 'car', 'hour', 5000, 0, 'active', ?, ?)`,
      )
      .run(now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const row = upgraded
      .getNativeConnection()
      .prepare('SELECT * FROM rate_plans WHERE id = ?')
      .get('legacy-car') as Record<string, unknown>
    upgraded.close()

    expect(row).toMatchObject({
      name: 'Automóvil por hora',
      billing_unit: 'hour',
      amount_cop: 5000,
      minimum_charge_cop: 0,
      plena_cop: null,
      grace_minutes: null,
      status: 'active',
    })
  })

  it('conserva las referencias de las sesiones al recrear la tabla', () => {
    const databasePath = path.join(directory, 'referencias.sqlite')
    const now = new Date().toISOString()

    const legacy = new DatabaseManager(databasePath, migrationsUpTo(0))
    legacy.initialize()
    const sqlite = legacy.getNativeConnection()
    sqlite
      .prepare(
        `INSERT INTO rate_plans
         (id, name, vehicle_type, billing_unit, amount_cop, grace_minutes, status, created_at, updated_at)
         VALUES ('legacy-car', 'Automóvil por hora', 'car', 'hour', 5000, 0, 'active', ?, ?)`,
      )
      .run(now, now)
    sqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES ('legacy-vehicle', 'ABC123', 'car', 'active', ?, ?)`,
      )
      .run(now, now)
    sqlite
      .prepare(
        `INSERT INTO parking_sessions
         (id, vehicle_id, rate_plan_id, entered_at, status, created_at, updated_at)
         VALUES ('legacy-session', 'legacy-vehicle', 'legacy-car', ?, 'active', ?, ?)`,
      )
      .run(now, now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const violations = upgraded.getNativeConnection().pragma('foreign_key_check') as unknown[]
    const session = upgraded
      .getNativeConnection()
      .prepare('SELECT rate_plan_id FROM parking_sessions WHERE id = ?')
      .get('legacy-session') as { rate_plan_id: string }
    upgraded.close()

    expect(violations).toHaveLength(0)
    expect(session.rate_plan_id).toBe('legacy-car')
  })
})

describe('snapshot del tiquete de ingreso', () => {
  it('agrega el snapshot sin perder sesiones activas existentes', () => {
    const databasePath = path.join(directory, 'entry-ticket.sqlite')
    const now = new Date().toISOString()
    const legacy = new DatabaseManager(databasePath, migrationsUpTo(5))
    legacy.initialize()
    const sqlite = legacy.getNativeConnection()
    sqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES ('vehicle-before-ticket', 'OLD123', 'car', 'active', ?, ?)`,
      )
      .run(now, now)
    sqlite
      .prepare(
        `INSERT INTO parking_sessions
         (id, vehicle_id, entered_at, status, created_at, updated_at)
         VALUES ('session-before-ticket', 'vehicle-before-ticket', ?, 'active', ?, ?)`,
      )
      .run(now, now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const session = upgraded
      .getNativeConnection()
      .prepare('SELECT status, entry_snapshot_json FROM parking_sessions WHERE id = ?')
      .get('session-before-ticket') as { status: string; entry_snapshot_json: string | null }
    upgraded.close()

    expect(session).toEqual({ status: 'active', entry_snapshot_json: null })
  })
})

describe('tipos de vehículo', () => {
  it('acepta todos los tipos compartidos y conserva los datos anteriores', () => {
    const databasePath = path.join(directory, 'tipos.sqlite')
    const now = new Date().toISOString()

    // Base creada antes de ampliar la lista, con datos de los tipos originales.
    const legacy = new DatabaseManager(databasePath, migrationsUpTo(6))
    legacy.initialize()
    const legacySqlite = legacy.getNativeConnection()
    legacySqlite
      .prepare(
        `INSERT INTO rate_plans
         (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop, status, created_at, updated_at)
         VALUES ('legacy-car', 'Automóvil por hora', 'car', 'hour', 5000, 0, 'active', ?, ?)`,
      )
      .run(now, now)
    legacySqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES ('legacy-vehicle', 'ABC123', 'car', 'active', ?, ?)`,
      )
      .run(now, now)
    legacySqlite
      .prepare(
        `INSERT INTO parking_sessions
         (id, vehicle_id, rate_plan_id, entered_at, status, created_at, updated_at)
         VALUES ('legacy-session', 'legacy-vehicle', 'legacy-car', ?, 'active', ?, ?)`,
      )
      .run(now, now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const sqlite = upgraded.getNativeConnection()
    const insertPlan = sqlite.prepare(
      `INSERT INTO rate_plans
       (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop, status, created_at, updated_at)
       VALUES (?, ?, ?, 'hour', 1000, 0, 'active', ?, ?)`,
    )
    const insertVehicle = sqlite.prepare(
      `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    )
    for (const [index, vehicleType] of VEHICLE_TYPES.entries()) {
      insertPlan.run(`plan-${vehicleType}`, `Tarifa ${vehicleType}`, vehicleType, now, now)
      insertVehicle.run(`vehicle-${vehicleType}`, `AAA${100 + index}`, vehicleType, now, now)
    }

    const planTypes = sqlite
      .prepare("SELECT vehicle_type FROM rate_plans WHERE id LIKE 'plan-%' ORDER BY vehicle_type")
      .all() as Array<{ vehicle_type: string }>
    const violations = sqlite.pragma('foreign_key_check') as unknown[]
    const session = sqlite
      .prepare('SELECT vehicle_id, rate_plan_id FROM parking_sessions WHERE id = ?')
      .get('legacy-session') as { vehicle_id: string; rate_plan_id: string }
    // Un tipo que no está en la lista sigue rechazado por la restricción.
    const rejected = (): void => {
      insertPlan.run('plan-invalid', 'Tarifa inválida', 'helicopter', now, now)
    }
    upgraded.close()

    expect(planTypes.map((plan) => plan.vehicle_type)).toEqual([...VEHICLE_TYPES].sort())
    expect(violations).toHaveLength(0)
    expect(session).toMatchObject({ vehicle_id: 'legacy-vehicle', rate_plan_id: 'legacy-car' })
    expect(rejected).toThrow()
  })
})
