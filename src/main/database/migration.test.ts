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

describe('eliminación de clientes y planes mensuales', () => {
  it('migra desde 0009 sin perder mensualidades, cobros ni referencias y conserva un respaldo recuperable', () => {
    const databasePath = path.join(directory, 'monthly.sqlite')
    const previousMigrations = migrationsUpTo(9)
    const legacy = new DatabaseManager(databasePath, previousMigrations)
    legacy.initialize()
    const sqlite = legacy.getNativeConnection()
    sqlite.exec(`
      INSERT INTO monthly_customers (id, full_name, status, created_at, updated_at)
      VALUES ('customer', 'Cliente anterior', 'active', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
      INSERT INTO rate_plans (id, name, vehicle_type, billing_unit, amount_cop, status, created_at, updated_at)
      VALUES ('plan', 'Plan anterior', 'car', 'month', 150000, 'active', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
      INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
      VALUES ('vehicle', 'MEN001', 'car', 'active', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
      INSERT INTO monthly_subscriptions (id, customer_id, vehicle_id, rate_plan_id, starts_at, ends_at, amount_cop, status, created_at, updated_at)
      VALUES ('subscription', 'customer', 'vehicle', 'plan', '2026-10-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z', 150000, 'active', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
      INSERT INTO payments (id, subscription_id, amount_cop, method, status, paid_at, created_at, updated_at)
      VALUES ('payment', 'subscription', 50000, 'cash', 'completed', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
      INSERT INTO receipts (id, receipt_number, payment_id, issued_at, status, snapshot_json, created_at, updated_at)
      VALUES ('receipt', 1, 'payment', '2026-10-01T05:00:00.000Z', 'issued', '{"paidCop":50000}', '2026-10-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z');
    `)
    const original = {
      subscription: sqlite.prepare('SELECT * FROM monthly_subscriptions').get(),
      payment: sqlite.prepare('SELECT * FROM payments').get(),
      receipt: sqlite.prepare('SELECT * FROM receipts').get(),
    }
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const migrated = upgraded.getNativeConnection()
    expect(migrated.prepare('SELECT deleted_at FROM monthly_customers').get()).toEqual({
      deleted_at: null,
    })
    expect(migrated.prepare('SELECT deleted_at FROM rate_plans').get()).toEqual({
      deleted_at: null,
    })
    expect(migrated.prepare('SELECT * FROM monthly_subscriptions').get()).toEqual(
      original.subscription,
    )
    expect(migrated.prepare('SELECT * FROM payments').get()).toEqual(original.payment)
    expect(migrated.prepare('SELECT * FROM receipts').get()).toEqual(original.receipt)
    expect(migrated.pragma('foreign_key_check')).toEqual([])
    upgraded.close()

    const backupDirectory = path.join(directory, 'migration-backups')
    const backup = fs.readdirSync(backupDirectory).find((file) => file.endsWith('.sqlite'))!
    const recovered = new DatabaseManager(path.join(backupDirectory, backup), previousMigrations)
    recovered.initialize()
    expect(
      recovered.getNativeConnection().prepare('SELECT * FROM monthly_subscriptions').get(),
    ).toEqual(original.subscription)
    expect(recovered.getNativeConnection().prepare('SELECT * FROM payments').get()).toEqual(
      original.payment,
    )
    expect(recovered.getNativeConnection().prepare('SELECT * FROM receipts').get()).toEqual(
      original.receipt,
    )
    expect(recovered.getNativeConnection().pragma('integrity_check', { simple: true })).toBe('ok')
    recovered.close()
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

describe('pagos pendientes', () => {
  it('agrega la tabla sin tocar las sesiones ni los cobros anteriores', () => {
    const databasePath = path.join(directory, 'pendientes.sqlite')
    const now = new Date().toISOString()

    const legacy = new DatabaseManager(databasePath, migrationsUpTo(7))
    legacy.initialize()
    const legacySqlite = legacy.getNativeConnection()
    legacySqlite
      .prepare(
        `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
         VALUES ('legacy-vehicle', 'ABC123', 'car', 'active', ?, ?)`,
      )
      .run(now, now)
    legacySqlite
      .prepare(
        `INSERT INTO parking_sessions
         (id, vehicle_id, entered_at, exited_at, status, calculated_amount_cop, created_at, updated_at)
         VALUES ('legacy-session', 'legacy-vehicle', ?, ?, 'closed', 5000, ?, ?)`,
      )
      .run(now, now, now, now)
    legacySqlite
      .prepare(
        `INSERT INTO payments
         (id, parking_session_id, amount_cop, method, status, paid_at, created_at, updated_at)
         VALUES ('legacy-payment', 'legacy-session', 5000, 'cash', 'completed', ?, ?, ?)`,
      )
      .run(now, now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const sqlite = upgraded.getNativeConnection()
    const session = sqlite
      .prepare('SELECT status, calculated_amount_cop FROM parking_sessions WHERE id = ?')
      .get('legacy-session')
    const payment = sqlite.prepare('SELECT status FROM payments WHERE id = ?').get('legacy-payment')
    const pending = sqlite.prepare('SELECT count(*) AS total FROM pending_payments').get()
    const insertPending = sqlite.prepare(
      `INSERT INTO pending_payments
       (id, parking_session_id, amount_cop, status, payment_id, snapshot_json, registered_at,
        created_at, updated_at)
       VALUES (?, 'legacy-session', ?, ?, ?, '{}', ?, ?, ?)`,
    )
    // Un pendiente no puede figurar pagado sin el pago que lo saldó.
    const paidWithoutPayment = (): void => {
      insertPending.run('pending-invalid', 5000, 'paid', null, now, now, now)
    }
    const withoutAmount = (): void => {
      insertPending.run('pending-zero', 0, 'pending', null, now, now, now)
    }
    insertPending.run('pending-valid', 5000, 'pending', null, now, now, now)
    const duplicated = (): void => {
      insertPending.run('pending-again', 5000, 'pending', null, now, now, now)
    }
    const violations = sqlite.pragma('foreign_key_check') as unknown[]

    expect(session).toEqual({ status: 'closed', calculated_amount_cop: 5000 })
    expect(payment).toEqual({ status: 'completed' })
    expect(pending).toEqual({ total: 0 })
    expect(paidWithoutPayment).toThrow()
    expect(withoutAmount).toThrow()
    expect(duplicated).toThrow()
    expect(violations).toHaveLength(0)
    upgraded.close()
  })
})

describe('saldo pendiente en el cierre de caja', () => {
  it('agrega las columnas sin alterar los cierres anteriores', () => {
    const databasePath = path.join(directory, 'cierre.sqlite')
    const now = new Date().toISOString()

    const legacy = new DatabaseManager(databasePath, migrationsUpTo(8))
    legacy.initialize()
    legacy
      .getNativeConnection()
      .prepare(
        `INSERT INTO cash_register_sessions
         (id, opened_at, closed_at, opening_amount_cop, closing_amount_cop, expected_amount_cop,
          status, created_at, updated_at)
         VALUES ('legacy-cash', ?, ?, 50000, 60000, 60000, 'closed', ?, ?)`,
      )
      .run(now, now, now, now)
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const session = upgraded
      .getNativeConnection()
      .prepare(
        `SELECT status, closing_amount_cop, expected_amount_cop, pending_count, pending_amount_cop
         FROM cash_register_sessions WHERE id = ?`,
      )
      .get('legacy-cash')
    upgraded.close()

    // Un cierre anterior a la función no tiene saldo guardado.
    expect(session).toEqual({
      status: 'closed',
      closing_amount_cop: 60_000,
      expected_amount_cop: 60_000,
      pending_count: null,
      pending_amount_cop: null,
    })
  })
})

describe('pagos pendientes devueltos por una anulación', () => {
  it('migra desde 0010 anulando solo las deudas que una anulación había devuelto al listado', () => {
    const databasePath = path.join(directory, 'voided-pending.sqlite')
    const at = '2026-10-06T15:00:00.000Z'
    const legacy = new DatabaseManager(databasePath, migrationsUpTo(10))
    legacy.initialize()
    const sqlite = legacy.getNativeConnection()
    const seedSession = sqlite.prepare(
      `INSERT INTO parking_sessions
       (id, vehicle_id, entered_at, exited_at, status, calculated_amount_cop, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'closed', 10000, ?, ?)`,
    )
    const seedPayment = sqlite.prepare(
      `INSERT INTO payments
       (id, parking_session_id, amount_cop, method, status, paid_at, created_at, updated_at)
       VALUES (?, ?, 10000, 'cash', ?, ?, ?, ?)`,
    )
    const seedPending = sqlite.prepare(
      `INSERT INTO pending_payments
       (id, parking_session_id, amount_cop, status, payment_id, snapshot_json, registered_at,
        settled_at, created_at, updated_at)
       VALUES (?, ?, 10000, ?, ?, '{}', ?, ?, ?, ?)`,
    )
    for (const [index, key] of ['returned', 'owed', 'paid'].entries()) {
      sqlite
        .prepare(
          `INSERT INTO vehicles (id, plate, vehicle_type, status, created_at, updated_at)
           VALUES (?, ?, 'car', 'active', ?, ?)`,
        )
        .run(`vehicle-${key}`, `PLA00${index}`, at, at)
      seedSession.run(`session-${key}`, `vehicle-${key}`, at, at, at, at)
    }
    // Cobrada y anulada dos veces con la regla anterior: volvió a quedar pendiente.
    seedPayment.run('void-old', 'session-returned', 'voided', '2026-10-06T16:00:00.000Z', at, at)
    seedPayment.run('void-new', 'session-returned', 'voided', '2026-10-06T17:00:00.000Z', at, at)
    seedPending.run('pending-returned', 'session-returned', 'pending', null, at, null, at, at)
    // Nunca se cobró: debe seguir por cobrar.
    seedPending.run('pending-owed', 'session-owed', 'pending', null, at, null, at, at)
    // Cobrada con normalidad: no cambia.
    seedPayment.run('payment-paid', 'session-paid', 'completed', at, at, at)
    seedPending.run('pending-paid', 'session-paid', 'paid', 'payment-paid', at, at, at, at)
    const untouched = {
      owed: sqlite.prepare("SELECT * FROM pending_payments WHERE id = 'pending-owed'").get(),
      paid: sqlite.prepare("SELECT * FROM pending_payments WHERE id = 'pending-paid'").get(),
      payments: sqlite.prepare('SELECT * FROM payments ORDER BY id').all(),
    }
    legacy.close()

    const upgraded = new DatabaseManager(databasePath, path.resolve('drizzle'))
    upgraded.initialize()
    const migrated = upgraded.getNativeConnection()
    expect(
      migrated
        .prepare(
          "SELECT status, payment_id, settled_at, amount_cop FROM pending_payments WHERE id = 'pending-returned'",
        )
        .get(),
    ).toEqual({
      status: 'paid',
      payment_id: 'void-new',
      settled_at: '2026-10-06T17:00:00.000Z',
      amount_cop: 10000,
    })
    expect(
      migrated.prepare("SELECT * FROM pending_payments WHERE id = 'pending-owed'").get(),
    ).toEqual(untouched.owed)
    expect(
      migrated.prepare("SELECT * FROM pending_payments WHERE id = 'pending-paid'").get(),
    ).toEqual(untouched.paid)
    expect(migrated.prepare('SELECT * FROM payments ORDER BY id').all()).toEqual(untouched.payments)
    expect(
      migrated
        .prepare(
          "SELECT entity_id, actor, details_json FROM audit_logs WHERE action = 'parking.pending_payment_voided_by_migration'",
        )
        .all(),
    ).toEqual([
      {
        entity_id: 'session-returned',
        actor: 'system-migration',
        details_json: '{"pendingPaymentId":"pending-returned","amountCop":10000}',
      },
    ])
    expect(migrated.pragma('foreign_key_check')).toEqual([])
    upgraded.close()
  })
})
