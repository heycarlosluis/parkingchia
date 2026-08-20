import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { DatabaseStatus } from '@shared/contracts'
import * as schema from './schema'

export type ParkingDatabase = BetterSQLite3Database<typeof schema>

export class DatabaseManager {
  private sqlite: Database.Database | null = null
  private database: ParkingDatabase | null = null

  constructor(
    private readonly databasePath: string,
    private readonly migrationsPath: string,
  ) {}

  initialize(): ParkingDatabase {
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true })
    const databaseExists =
      fs.existsSync(this.databasePath) && fs.statSync(this.databasePath).size > 0

    const sqlite = new Database(this.databasePath)
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
    if (databaseExists) this.createPreMigrationBackup(sqlite)

    const database = drizzle(sqlite, { schema })
    // Recrear una tabla referenciada exige claves foráneas desactivadas fuera de la transacción:
    // dentro de ella `PRAGMA foreign_keys` es un no-op y `defer_foreign_keys` no reevalúa la cuenta.
    sqlite.pragma('foreign_keys = OFF')
    try {
      migrate(database, { migrationsFolder: this.migrationsPath })
    } finally {
      sqlite.pragma('foreign_keys = ON')
    }
    const violations = sqlite.pragma('foreign_key_check') as unknown[]
    if (violations.length > 0) {
      sqlite.close()
      throw new Error('La migración dejó referencias inconsistentes en la base de datos')
    }

    this.sqlite = sqlite
    this.database = database
    return database
  }

  getDatabase(): ParkingDatabase {
    if (!this.database) throw new Error('La base de datos no está inicializada')
    return this.database
  }

  getNativeConnection(): Database.Database {
    if (!this.sqlite) throw new Error('La base de datos no está inicializada')
    return this.sqlite
  }

  getStatus(): DatabaseStatus {
    if (!this.sqlite?.open) {
      return { connected: false, journalMode: 'unknown', foreignKeys: false, pathLabel: 'userData' }
    }
    const journal = this.sqlite.pragma('journal_mode', { simple: true })
    const foreignKeys = this.sqlite.pragma('foreign_keys', { simple: true })
    return {
      connected: true,
      journalMode: String(journal).toUpperCase(),
      foreignKeys: Number(foreignKeys) === 1,
      pathLabel: 'Datos locales de la aplicación',
    }
  }

  backupTo(destination: string): Promise<void> {
    const sqlite = this.getNativeConnection()
    return sqlite.backup(destination).then(() => undefined)
  }

  close(): void {
    if (this.sqlite?.open) this.sqlite.close()
    this.database = null
    this.sqlite = null
  }

  private createPreMigrationBackup(sqlite: Database.Database): void {
    const backupDirectory = path.join(path.dirname(this.databasePath), 'migration-backups')
    fs.mkdirSync(backupDirectory, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const destination = path.join(backupDirectory, `parkingchia-${stamp}.sqlite`)
    sqlite.prepare('VACUUM INTO ?').run(destination)

    const backups = fs
      .readdirSync(backupDirectory)
      .filter((entry) => entry.endsWith('.sqlite'))
      .sort()
    for (const stale of backups.slice(0, Math.max(0, backups.length - 5))) {
      fs.unlinkSync(path.join(backupDirectory, stale))
    }
  }
}
