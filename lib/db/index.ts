import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not configured. Please provide a valid PostgreSQL connection string.')
  }
  return url
}

export function createDb() {
  const sql = neon(getDatabaseUrl())
  return drizzle(sql, { schema })
}

export type Db = ReturnType<typeof createDb>

let cachedDb: Db | undefined

export function db() {
  if (!cachedDb) cachedDb = createDb()
  return cachedDb
}

export { schema }
