/**
 * Global setup for vitest.integration.config.mts.
 *
 * Integration suites must never be skipped silently and must never run against
 * a database that was not explicitly designated for tests.
 */
export default function requireTestDatabase() {
  const url = process.env.TEST_DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      'Integration tests require TEST_DATABASE_URL pointing to a DISPOSABLE test database ' +
        '(e.g. a dedicated Neon branch). DATABASE_URL and .env are intentionally ignored. ' +
        'Never use the production database.',
    )
  }
  if (process.env.PRODUCTION_DATABASE_URL && process.env.PRODUCTION_DATABASE_URL.trim() === url) {
    throw new Error('TEST_DATABASE_URL is identical to PRODUCTION_DATABASE_URL. Refusing to run destructive tests.')
  }
}
