import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.PARKINGCHIA_DEV_DB ?? './.data/parkingchia-development.sqlite',
  },
  strict: true,
  verbose: true,
})
