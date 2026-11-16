import { defineConfig } from 'vitest/config'

/**
 * UNIT tests: no database, no network.
 *
 * `DATABASE_URL` is forced to an empty string so that any accidental database
 * access fails loudly ("DATABASE_URL environment variable is not configured")
 * instead of silently reaching the database configured in a developer `.env`
 * (dotenv never overrides a variable that is already set).
 *
 * Database-backed suites live in vitest.integration.config.mts.
 */
export const INTEGRATION_TEST_FILES = [
  'lib/rate-limit.test.ts',
  'lib/attendance/leave.test.ts',
  'tests/integration/**/*.test.ts',
]

/** Files under tests/integration that are pure (fully mocked, no DB). */
export const PURE_TESTS_IN_INTEGRATION_DIR = [
  'tests/integration/cookie-consent.test.ts',
  'tests/integration/cookie-storage.test.ts',
  'tests/integration/zod-validation.test.ts',
  'tests/integration/dashboard-route.test.ts',
]

export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', ...PURE_TESTS_IN_INTEGRATION_DIR],
    exclude: ['lib/rate-limit.test.ts', 'lib/attendance/leave.test.ts', 'node_modules/**'],
    env: { DATABASE_URL: '' },
    testTimeout: 60000,
  },
})
