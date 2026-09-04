import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Auto-retry fetch wrapper to gracefully handle Neon serverless cold-starts & temporary network glitches
if (!neonConfig.fetchFunction) {
  neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetch(input, init)
      } catch (err) {
        lastError = err
        if (attempt < 2) {
          // Wait 500ms then 1000ms before retrying (gives Neon compute instance time to wake up)
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
        }
      }
    }
    throw lastError
  }
}

const FALLBACK_DATABASE_URL =
  'postgresql://neondb_owner:npg_o9Ha8DwRJYvb@ep-old-mouse-azu1z2vd-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim() || FALLBACK_DATABASE_URL
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
