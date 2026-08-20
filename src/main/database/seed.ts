import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export function seedDevelopmentData(sqlite: Database.Database): void {
  const now = new Date().toISOString()
  sqlite.transaction(() => {
    const insertRate = sqlite.prepare(`
      INSERT OR IGNORE INTO rate_plans
      (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop, plena_cop,
       grace_minutes, status, created_at, updated_at)
      VALUES (?, ?, ?, 'hour', ?, ?, ?, NULL, 'active', ?, ?)
    `)
    const carRateId = 'dev-rate-car-hour'
    insertRate.run(carRateId, 'Automóvil por hora', 'car', 5000, 3000, 30000, now, now)
    insertRate.run(
      'dev-rate-motorcycle-hour',
      'Motocicleta por hora',
      'motorcycle',
      2500,
      2000,
      15000,
      now,
      now,
    )

    const vehicleId = 'dev-vehicle-example'
    sqlite
      .prepare(
        `
        INSERT OR IGNORE INTO vehicles
        (id, plate, vehicle_type, description, status, created_at, updated_at)
        VALUES (?, 'ABC123', 'car', 'Vehículo de desarrollo', 'active', ?, ?)
      `,
      )
      .run(vehicleId, now, now)

    sqlite
      .prepare(
        `
        INSERT OR IGNORE INTO parking_sessions
        (id, vehicle_id, rate_plan_id, entered_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?)
      `,
      )
      .run(`dev-session-${randomUUID()}`, vehicleId, carRateId, now, now, now)
  })()
}
