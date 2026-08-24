import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const DEFAULT_DATABASE_URL =
  'postgresql://neondb_owner:npg_o9Ha8DwRJYvb@ep-old-mouse-azu1z2vd-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured')
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
