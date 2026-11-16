import { defineConfig } from 'vitest/config'
import { INTEGRATION_TEST_FILES, PURE_TESTS_IN_INTEGRATION_DIR } from './vitest.config.mts'

/**
 * INTEGRATION tests: require a DISPOSABLE database.
 *
 * Safety rules (see docs/CI_CD_CONFIGURATION.md):
 *  - The database is taken ONLY from `TEST_DATABASE_URL`. `DATABASE_URL` and the
 *    developer `.env` are never used, so a production connection string sitting
 *    in `.env` cannot be reached by these destructive suites.
 *  - `TEST_DATABASE_URL` must be set, otherwise the run FAILS (tests/setup/
 *    require-test-database.ts) instead of silently skipping every suite.
 *  - Suites create and delete their own organizations; never point this at a
 *    database holding real data.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? ''

export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  test: {
    environment: 'node',
    include: INTEGRATION_TEST_FILES,
    exclude: [...PURE_TESTS_IN_INTEGRATION_DIR, 'node_modules/**'],
    globalSetup: ['tests/setup/require-test-database.ts'],
    // Overrides whatever DATABASE_URL the shell or .env provides (dotenv never
    // overrides an existing variable).
    env: { DATABASE_URL: testDatabaseUrl },
    // Suites share one database; run files sequentially to avoid cross-suite
    // interference.
    fileParallelism: false,
    testTimeout: 60000,
  },
})
