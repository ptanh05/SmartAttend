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
