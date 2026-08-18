import type Database from 'better-sqlite3'
import type { AppSettings } from '@shared/contracts'
import type { UpdateSettingsInput } from '@shared/ipc'

const DEFAULT_SETTINGS: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
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
    }
  }

  update(input: UpdateSettingsInput): AppSettings {
    const current = this.get()
    const next: AppSettings = {
      printerName: input.printerName === undefined ? current.printerName : input.printerName,
      paperWidth: input.paperWidth ?? current.paperWidth,
      showPrintDialog: input.showPrintDialog ?? current.showPrintDialog,
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
    })()
    return next
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
