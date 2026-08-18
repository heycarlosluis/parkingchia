import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { seedDevelopmentData } from '../src/main/database/seed'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.resolve(
  root,
  process.env.PARKINGCHIA_DEV_DB ?? '.data/parkingchia-development.sqlite',
)
const command = process.argv[2]

if (!['migrate', 'seed'].includes(command ?? '')) {
  throw new Error('Usa: npm run db:migrate o npm run db:seed')
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const sqlite = new Database(databasePath)
try {
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  const database = drizzle(sqlite)
  migrate(database, { migrationsFolder: path.join(root, 'drizzle') })
  if (command === 'seed') seedDevelopmentData(sqlite)
  process.stdout.write(
    `${command === 'seed' ? 'Datos de desarrollo creados' : 'Migraciones aplicadas'} en ${databasePath}\n`,
  )
} finally {
  sqlite.close()
}
