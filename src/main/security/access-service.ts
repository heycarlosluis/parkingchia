import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AccessActionResult, AccessState, ParkingProfile } from '@shared/contracts'
import type { CompleteOnboardingInput, ParkingProfileInput, SetPinInput } from '@shared/ipc'

const SETTING_KEYS = {
  onboardingCompleted: 'onboarding.completed',
  parkingName: 'parking.name',
  parkingAddress: 'parking.address',
  parkingPhone: 'parking.phone',
  parkingLogo: 'parking.logo',
  pinHash: 'security.pinHash',
} as const

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MILLISECONDS = 30_000

export class AccessService {
  private unlocked: boolean
  private failedAttempts = 0
  private blockedUntil = 0

  constructor(private readonly sqlite: Database.Database) {
    this.unlocked = !this.hasPin()
  }

  getState(): AccessState {
    const profile = this.getProfile()
    const onboardingCompleted =
      this.getSetting(SETTING_KEYS.onboardingCompleted) === 'true' && profile !== null
    const pinConfigured = this.hasPin()

    return {
      onboardingCompleted,
      profile,
      pinConfigured,
      locked: onboardingCompleted && pinConfigured && !this.unlocked,
    }
  }

  canUseApplication(): boolean {
    const state = this.getState()
    return state.onboardingCompleted && !state.locked
  }

  assertApplicationAccess(): void {
    if (!this.canUseApplication()) throw new Error('Acceso local requerido')
  }

  completeOnboarding(input: CompleteOnboardingInput): AccessState {
    if (this.getState().onboardingCompleted) throw new Error('El onboarding ya fue completado')

    const now = new Date().toISOString()
    const transaction = this.sqlite.transaction(() => {
      this.upsertSetting(SETTING_KEYS.parkingName, input.name, now)
      this.upsertSetting(SETTING_KEYS.parkingAddress, input.address, now)
      this.upsertSetting(SETTING_KEYS.parkingPhone, input.phone, now)
      if (input.logoDataUrl) this.upsertSetting(SETTING_KEYS.parkingLogo, input.logoDataUrl, now)
      if (input.pin) this.upsertSetting(SETTING_KEYS.pinHash, this.hashPin(input.pin), now)
      else this.deleteSetting(SETTING_KEYS.pinHash)
      this.upsertSetting(SETTING_KEYS.onboardingCompleted, 'true', now)
      this.writeAudit('onboarding.completed', 'application', now, {
        pinConfigured: Boolean(input.pin),
      })
    })

    transaction()
    this.unlocked = true
    return this.getState()
  }

  updateProfile(input: ParkingProfileInput): AccessState {
    this.assertApplicationAccess()
    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.upsertSetting(SETTING_KEYS.parkingName, input.name, now)
      this.upsertSetting(SETTING_KEYS.parkingAddress, input.address, now)
      this.upsertSetting(SETTING_KEYS.parkingPhone, input.phone, now)
      if (input.logoDataUrl === null) this.deleteSetting(SETTING_KEYS.parkingLogo)
      else if (input.logoDataUrl !== undefined) {
        this.upsertSetting(SETTING_KEYS.parkingLogo, input.logoDataUrl, now)
      }
      this.writeAudit('parking.profile_updated', 'application', now)
    })()
    return this.getState()
  }

  unlock(pin: string): AccessActionResult {
    const state = this.getState()
    if (!state.pinConfigured) {
      this.unlocked = true
      return this.result(true, 'La aplicación no requiere PIN.')
    }

    const remainingBlockSeconds = Math.ceil((this.blockedUntil - Date.now()) / 1000)
    if (remainingBlockSeconds > 0) {
      return this.result(
        false,
        `Espera ${remainingBlockSeconds} segundos antes de intentarlo nuevamente.`,
        remainingBlockSeconds,
      )
    }

    if (this.verifyPin(pin)) {
      this.failedAttempts = 0
      this.blockedUntil = 0
      this.unlocked = true
      return this.result(true, 'Acceso permitido.')
    }

    this.failedAttempts += 1
    const remainingAttempts = MAX_FAILED_ATTEMPTS - this.failedAttempts
    if (remainingAttempts <= 0) {
      this.failedAttempts = 0
      this.blockedUntil = Date.now() + LOCKOUT_MILLISECONDS
      return this.result(
        false,
        'Demasiados intentos. Espera 30 segundos antes de volver a intentarlo.',
        LOCKOUT_MILLISECONDS / 1000,
      )
    }

    return this.result(
      false,
      `El PIN no coincide. Quedan ${remainingAttempts} intentos antes de la pausa.`,
    )
  }

  lock(): AccessState {
    this.assertApplicationAccess()
    if (this.hasPin()) this.unlocked = false
    return this.getState()
  }

  setPin(input: SetPinInput): AccessActionResult {
    this.assertApplicationAccess()
    const pinAlreadyConfigured = this.hasPin()
    if (pinAlreadyConfigured && (!input.currentPin || !this.verifyPin(input.currentPin))) {
      return this.result(false, 'El PIN actual no coincide.')
    }

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.upsertSetting(SETTING_KEYS.pinHash, this.hashPin(input.newPin), now)
      this.writeAudit(
        pinAlreadyConfigured ? 'security.pin_changed' : 'security.pin_created',
        'application',
        now,
      )
    })()
    this.unlocked = true
    return this.result(true, 'El PIN local quedó guardado.')
  }

  removePin(currentPin: string): AccessActionResult {
    this.assertApplicationAccess()
    if (!this.hasPin()) return this.result(true, 'La aplicación ya está sin PIN.')
    if (!this.verifyPin(currentPin)) return this.result(false, 'El PIN actual no coincide.')

    const now = new Date().toISOString()
    this.sqlite.transaction(() => {
      this.deleteSetting(SETTING_KEYS.pinHash)
      this.writeAudit('security.pin_removed', 'application', now)
    })()
    this.unlocked = true
    this.failedAttempts = 0
    this.blockedUntil = 0
    return this.result(true, 'El PIN local fue eliminado.')
  }

  private getProfile(): ParkingProfile | null {
    const name = this.getSetting(SETTING_KEYS.parkingName)
    const address = this.getSetting(SETTING_KEYS.parkingAddress)
    const phone = this.getSetting(SETTING_KEYS.parkingPhone)
    if (!name || !address || !phone) return null
    return { name, address, phone, logoDataUrl: this.getSetting(SETTING_KEYS.parkingLogo) }
  }

  private result(
    success: boolean,
    message: string,
    retryAfterSeconds: number | null = null,
  ): AccessActionResult {
    return { success, message, state: this.getState(), retryAfterSeconds }
  }

  private hasPin(): boolean {
    return Boolean(this.getSetting(SETTING_KEYS.pinHash))
  }

  private hashPin(pin: string): string {
    const salt = randomBytes(16)
    const derived = scryptSync(pin, salt, 32)
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
  }

  private verifyPin(pin: string): boolean {
    const stored = this.getSetting(SETTING_KEYS.pinHash)
    if (!stored) return false
    const [algorithm, saltValue, hashValue] = stored.split('$')
    if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false

    try {
      const expected = Buffer.from(hashValue, 'base64')
      const actual = scryptSync(pin, Buffer.from(saltValue, 'base64'), expected.length)
      return expected.length === actual.length && timingSafeEqual(expected, actual)
    } catch {
      return false
    }
  }

  private getSetting(key: string): string | null {
    const row = this.sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row?.value ?? null
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

  private deleteSetting(key: string): void {
    this.sqlite.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
  }

  private writeAudit(
    action: string,
    entityType: string,
    createdAt: string,
    details?: Record<string, unknown>,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO audit_logs
          (id, action, entity_type, actor, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        action,
        entityType,
        'local-operator',
        details ? JSON.stringify(details) : null,
        createdAt,
      )
  }
}
