// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
