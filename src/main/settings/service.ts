import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AppSettings } from '@shared/contracts'
import type { UpdateSettingsInput } from '@shared/ipc'

const DEFAULT_SETTINGS: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
  printWidthMm: null,
  printOffsetMm: 0,
  simpleChargeMode: false,
}

const SIMPLE_CHARGE_MODE_KEY = 'operation.simpleChargeMode'

/**
 * Lee el modo de cobro directamente de `app_settings`.
 *
 * Caja, Parqueo y Mensualidades lo consultan en cada operación, de modo que el
 * proceso principal decide qué exigir aunque el renderer tenga un valor viejo.
 */
export function readSimpleChargeMode(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(SIMPLE_CHARGE_MODE_KEY) as { value: string } | undefined
  return row?.value === 'true'
}

export class SettingsService {
  constructor(private readonly sqlite: Database.Database) {}

  get(): AppSettings {
    const rows = this.sqlite
      .prepare('SELECT key, value FROM app_settings WHERE key LIKE ?')
      .all('printing.%') as Array<{ key: string; value: string }>

    const values = new Map(rows.map((row) => [row.key, row.value]))
    return {
      printerName: this.parseNullableString(values.get('printing.printerName')),
      paperWidth: values.get('printing.paperWidth') === '58mm' ? '58mm' : '80mm',
      showPrintDialog: values.get('printing.showPrintDialog') !== 'false',
      printWidthMm: this.parseNullableNumber(values.get('printing.printWidthMm')),
      printOffsetMm:
        this.parseNullableNumber(values.get('printing.printOffsetMm')) ??
        DEFAULT_SETTINGS.printOffsetMm,
      simpleChargeMode: readSimpleChargeMode(this.sqlite),
    }
  }

  update(input: UpdateSettingsInput): AppSettings {
    const current = this.get()
    // Un ajuste calibrado para un rollo no sirve para el otro: 64 mm de ancho
    // se saldrían de un papel de 58 mm. Cambiar el papel vuelve al automático
    // salvo que la misma solicitud traiga valores nuevos.
    const paperChanged = input.paperWidth !== undefined && input.paperWidth !== current.paperWidth
    const base: AppSettings = paperChanged
      ? { ...current, printWidthMm: null, printOffsetMm: 0 }
      : current
    const next: AppSettings = {
      printerName: input.printerName === undefined ? current.printerName : input.printerName,
      paperWidth: input.paperWidth ?? current.paperWidth,
      showPrintDialog: input.showPrintDialog ?? current.showPrintDialog,
      printWidthMm: input.printWidthMm === undefined ? base.printWidthMm : input.printWidthMm,
      printOffsetMm: input.printOffsetMm ?? base.printOffsetMm,
      simpleChargeMode: input.simpleChargeMode ?? current.simpleChargeMode,
    }
    const now = new Date().toISOString()
    const upsert = this.sqlite.prepare(`
      INSERT INTO app_settings (key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    this.sqlite.transaction(() => {
      upsert.run('printing.printerName', JSON.stringify(next.printerName), now, now)
      upsert.run('printing.paperWidth', next.paperWidth, now, now)
      upsert.run('printing.showPrintDialog', String(next.showPrintDialog), now, now)
      upsert.run('printing.printWidthMm', JSON.stringify(next.printWidthMm), now, now)
      upsert.run('printing.printOffsetMm', JSON.stringify(next.printOffsetMm), now, now)
      upsert.run(SIMPLE_CHARGE_MODE_KEY, String(next.simpleChargeMode), now, now)
      // Cambia qué controles aplica la caja, así que queda en la auditoría.
      if (next.simpleChargeMode !== current.simpleChargeMode) {
        this.sqlite
          .prepare(
            `INSERT INTO audit_logs (id, action, entity_type, actor, details_json, created_at)
             VALUES (?, 'settings.simple_charge_mode_changed', 'app_settings', 'local-operator', ?, ?)`,
          )
          .run(randomUUID(), JSON.stringify({ enabled: next.simpleChargeMode }), now)
      }
    })()
    return next
  }

  private parseNullableNumber(value: string | undefined): number | null {
    if (!value) return null
    try {
      const parsed: unknown = JSON.parse(value)
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  private parseNullableString(value: string | undefined): string | null {
    if (!value) return DEFAULT_SETTINGS.printerName
    try {
      const parsed: unknown = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : null
    } catch {
      return null
    }
  }
}
