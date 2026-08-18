// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DatabaseManager } from './connection'

describe('inicialización SQLite', () => {
  it('aplica migraciones, WAL y claves foráneas en una base aislada', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parkingchia-test-'))
    const manager = new DatabaseManager(
      path.join(directory, 'test.sqlite'),
      path.resolve('drizzle'),
    )
    try {
      manager.initialize()
      const tables = manager
        .getNativeConnection()
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
      expect(tables.map((table) => table.name)).toContain('parking_sessions')
      expect(manager.getStatus()).toMatchObject({
        connected: true,
        journalMode: 'WAL',
        foreignKeys: true,
      })
      manager.close()

      const reopenedManager = new DatabaseManager(
        path.join(directory, 'test.sqlite'),
        path.resolve('drizzle'),
      )
      reopenedManager.initialize()
      reopenedManager.close()
      const backups = fs.readdirSync(path.join(directory, 'migration-backups'))
      expect(backups).toHaveLength(1)
    } finally {
      manager.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
