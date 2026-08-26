import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { RatePlan, TariffConfiguration } from '@shared/contracts'
import {
  calculateChargeForMinutes,
  DEFAULT_TARIFF_SETTINGS,
  graceMinutesSchema,
  plenaThresholdSchema,
  ROUNDING_STEPS_COP,
  TARIFF_CURRENCY,
  tariffBillingUnitSchema,
  taxPercentSchema,
  type CreateRatePlanInput,
  type ParkingCharge,
  type RatePlanBillingUnit,
  type RoundingStepCop,
  type SimulateChargeInput,
  type TariffSettings,
  type UpdateRatePlanInput,
  type UpdateTariffSettingsInput,
} from '@shared/tariff'
import { OperationError } from '@main/ipc/errors'

const SETTING_KEYS = {
  billingUnit: 'tariff.billingUnit',
  graceMinutes: 'tariff.graceMinutes',
  taxEnabled: 'tariff.taxEnabled',
  taxPercent: 'tariff.taxPercent',
  taxIncludedInPrice: 'tariff.taxIncludedInPrice',
  plenaThresholdHours: 'tariff.plenaThresholdHours',
  roundingStepCop: 'tariff.roundingStepCop',
} as const

/** Unidades que administra este módulo. `day` y `month` pertenecen a mensualidades. */
const TIME_BASED_UNITS: ReadonlyArray<RatePlanBillingUnit> = ['minute', 'hour']

type RatePlanRow = {
  id: string
  name: string
  vehicle_type: RatePlan['vehicleType']
  billing_unit: RatePlanBillingUnit
  amount_cop: number
  minimum_charge_cop: number
  plena_cop: number | null
  grace_minutes: number | null
  status: RatePlan['status']
  created_at: string
  updated_at: string
}

export class TariffService {
  constructor(private readonly sqlite: Database.Database) {}

  getConfiguration(): TariffConfiguration {
    return { settings: this.getSettings(), plans: this.listPlans() }
  }

  getSettings(): TariffSettings {
    const rows = this.sqlite
      .prepare('SELECT key, value FROM app_settings WHERE key LIKE ?')
      .all('tariff.%') as Array<{ key: string; value: string }>
    const stored = new Map(rows.map((row) => [row.key, row.value]))

    // Cada ajuste cae por separado a su valor por defecto: un solo valor
    // corrupto no puede revertir en silencio la unidad de cobro ni el redondeo
    // con los que se está cobrando.
    return {
      billingUnit: this.readValid(
        tariffBillingUnitSchema,
        stored.get(SETTING_KEYS.billingUnit),
        DEFAULT_TARIFF_SETTINGS.billingUnit,
      ),
      graceMinutes: this.readValid(
        graceMinutesSchema,
        this.readInteger(
          stored.get(SETTING_KEYS.graceMinutes),
          DEFAULT_TARIFF_SETTINGS.graceMinutes,
        ),
        DEFAULT_TARIFF_SETTINGS.graceMinutes,
      ),
      currency: TARIFF_CURRENCY,
      taxEnabled: this.readBoolean(
        stored.get(SETTING_KEYS.taxEnabled),
        DEFAULT_TARIFF_SETTINGS.taxEnabled,
      ),
      taxPercent: this.readValid(
        taxPercentSchema,
        this.readNumber(stored.get(SETTING_KEYS.taxPercent), DEFAULT_TARIFF_SETTINGS.taxPercent),
        DEFAULT_TARIFF_SETTINGS.taxPercent,
      ),
      taxIncludedInPrice: this.readBoolean(
        stored.get(SETTING_KEYS.taxIncludedInPrice),
        DEFAULT_TARIFF_SETTINGS.taxIncludedInPrice,
      ),
      plenaThresholdHours: this.readValid(
        plenaThresholdSchema,
        this.readInteger(
          stored.get(SETTING_KEYS.plenaThresholdHours),
          DEFAULT_TARIFF_SETTINGS.plenaThresholdHours,
        ),
        DEFAULT_TARIFF_SETTINGS.plenaThresholdHours,
      ),
      roundingStepCop: this.asRoundingStep(
        this.readInteger(
          stored.get(SETTING_KEYS.roundingStepCop),
          DEFAULT_TARIFF_SETTINGS.roundingStepCop,
        ),
      ),
    }
  }

  updateSettings(input: UpdateTariffSettingsInput): TariffConfiguration {
    const current = this.getSettings()
    const next: TariffSettings = {
      billingUnit: input.billingUnit ?? current.billingUnit,
      graceMinutes: input.graceMinutes ?? current.graceMinutes,
      currency: TARIFF_CURRENCY,
      taxEnabled: input.taxEnabled ?? current.taxEnabled,
      taxPercent: input.taxPercent ?? current.taxPercent,
      taxIncludedInPrice: input.taxIncludedInPrice ?? current.taxIncludedInPrice,
      plenaThresholdHours: input.plenaThresholdHours ?? current.plenaThresholdHours,
      roundingStepCop: this.asRoundingStep(input.roundingStepCop ?? current.roundingStepCop),
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.upsertSetting(SETTING_KEYS.billingUnit, next.billingUnit, now)
      this.upsertSetting(SETTING_KEYS.graceMinutes, String(next.graceMinutes), now)
      this.upsertSetting(SETTING_KEYS.taxEnabled, String(next.taxEnabled), now)
      this.upsertSetting(SETTING_KEYS.taxPercent, String(next.taxPercent), now)
      this.upsertSetting(SETTING_KEYS.taxIncludedInPrice, String(next.taxIncludedInPrice), now)
      this.upsertSetting(SETTING_KEYS.plenaThresholdHours, String(next.plenaThresholdHours), now)
      this.upsertSetting(SETTING_KEYS.roundingStepCop, String(next.roundingStepCop), now)

      if (next.billingUnit !== current.billingUnit) {
        this.sqlite
          .prepare(
            `UPDATE rate_plans SET billing_unit = ?, updated_at = ?
             WHERE billing_unit IN ('minute', 'hour')`,
          )
          .run(next.billingUnit, now)
      }

      this.writeAudit('tariff.settings_updated', 'tariff', null, now, {
        billingUnit: next.billingUnit,
        graceMinutes: next.graceMinutes,
        taxEnabled: next.taxEnabled,
        taxPercent: next.taxPercent,
        taxIncludedInPrice: next.taxIncludedInPrice,
        plenaThresholdHours: next.plenaThresholdHours,
        roundingStepCop: next.roundingStepCop,
      })
    })()

    return this.getConfiguration()
  }

  createPlan(input: CreateRatePlanInput): TariffConfiguration {
    const billingUnit = this.getSettings().billingUnit
    const id = randomUUID()
    const now = new Date().toISOString()

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO rate_plans
           (id, name, vehicle_type, billing_unit, amount_cop, minimum_charge_cop,
            plena_cop, grace_minutes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.name,
          input.vehicleType,
          billingUnit,
          input.amountCop,
          input.minimumChargeCop,
          input.plenaCop,
          input.graceMinutes,
          input.status,
          now,
          now,
        )
      this.writeAudit('tariff.plan_created', 'rate_plan', id, now, { name: input.name })
    })()

    return this.getConfiguration()
  }

  updatePlan(input: UpdateRatePlanInput): TariffConfiguration {
    this.requireTimeBasedPlan(input.id, 'La tarifa que intentas editar ya no existe.')

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE rate_plans
           SET name = ?, vehicle_type = ?, amount_cop = ?, minimum_charge_cop = ?,
               plena_cop = ?, grace_minutes = ?, status = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.name,
          input.vehicleType,
          input.amountCop,
          input.minimumChargeCop,
          input.plenaCop,
          input.graceMinutes,
          input.status,
          now,
          input.id,
        )
      this.writeAudit('tariff.plan_updated', 'rate_plan', input.id, now, { name: input.name })
    })()

    return this.getConfiguration()
  }

  deletePlan(id: string): TariffConfiguration {
    const existing = this.requireTimeBasedPlan(id, 'La tarifa que intentas eliminar ya no existe.')
    if (this.countReferences(id) > 0) {
      throw new OperationError(
        'RATE_PLAN_IN_USE',
        'Esta tarifa ya se usó en sesiones o mensualidades. Desactívala en lugar de eliminarla.',
      )
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM rate_plans WHERE id = ?').run(id)
      this.writeAudit('tariff.plan_deleted', 'rate_plan', id, now, { name: existing.name })
    })()

    return this.getConfiguration()
  }

  simulate(input: SimulateChargeInput): ParkingCharge {
    const plan = this.requireTimeBasedPlan(input.ratePlanId, 'La tarifa seleccionada ya no existe.')
    return calculateChargeForMinutes(input.minutes, this.getSettings(), {
      amountCop: plan.amountCop,
      minimumChargeCop: plan.minimumChargeCop,
      plenaCop: plan.plenaCop,
      graceMinutes: plan.graceMinutes,
    })
  }

  listPlans(): RatePlan[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM rate_plans
         WHERE billing_unit IN ('minute', 'hour')
         ORDER BY status = 'inactive', vehicle_type, name`,
      )
      .all() as RatePlanRow[]
    return rows.map((row) => this.toRatePlan(row))
  }

  /**
   * Tarifa por tiempo administrada por este módulo.
   *
   * Los planes `day` y `month` pertenecen a Mensualidades. Tratarlos aquí
   * liquidaría un precio mensual como si fuera el de una hora, y eliminarlos
   * desde Tarifas dejaría a Mensualidades sin su plan.
   */
  private requireTimeBasedPlan(id: string, missingMessage: string): RatePlan {
    const plan = this.findPlan(id)
    if (!plan) {
      throw new OperationError('RATE_PLAN_NOT_FOUND', missingMessage)
    }
    if (!TIME_BASED_UNITS.includes(plan.billingUnit)) {
      throw new OperationError(
        'RATE_PLAN_NOT_APPLICABLE',
        'Esa tarifa pertenece a Mensualidades y no se administra desde aquí.',
      )
    }
    return plan
  }

  private findPlan(id: string): RatePlan | null {
    const row = this.sqlite.prepare('SELECT * FROM rate_plans WHERE id = ?').get(id) as
      RatePlanRow | undefined
    return row ? this.toRatePlan(row) : null
  }

  private countReferences(id: string): number {
    const row = this.sqlite
      .prepare(
        `SELECT
           (SELECT count(*) FROM parking_sessions WHERE rate_plan_id = ?) +
           (SELECT count(*) FROM monthly_subscriptions WHERE rate_plan_id = ?) AS total`,
      )
      .get(id, id) as { total: number }
    return row.total
  }

  private toRatePlan(row: RatePlanRow): RatePlan {
    return {
      id: row.id,
      name: row.name,
      vehicleType: row.vehicle_type,
      billingUnit: row.billing_unit,
      amountCop: row.amount_cop,
      minimumChargeCop: row.minimum_charge_cop,
      plenaCop: row.plena_cop,
      graceMinutes: row.grace_minutes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private asRoundingStep(value: number): RoundingStepCop {
    const match = ROUNDING_STEPS_COP.find((step) => step === value)
    return match ?? DEFAULT_TARIFF_SETTINGS.roundingStepCop
  }

  /** Devuelve el valor guardado solo si sigue siendo válido; si no, el predeterminado. */
  private readValid<T>(
    schema: { safeParse: (value: unknown) => { success: boolean } },
    value: unknown,
    fallback: T,
  ): T {
    return schema.safeParse(value).success ? (value as T) : fallback
  }

  private readInteger(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private readNumber(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private readBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback
    return value === 'true'
  }

  private upsertSetting(key: string, value: string, now: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now, now)
  }

  private writeAudit(
    action: string,
    entityType: string,
    entityId: string | null,
    createdAt: string,
    details: Record<string, unknown>,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, actor, details_json, created_at)
         VALUES (?, ?, ?, ?, 'local-operator', ?, ?)`,
      )
      .run(randomUUID(), action, entityType, entityId, JSON.stringify(details), createdAt)
  }
}
