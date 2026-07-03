import { defineConfig } from 'vitest/config'

// E2e runner: drives the app in a real (headless) browser with the wallet + network mocked.
// Kept separate from the unit vitest config (jsdom) — these run in node against a live dev server.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    globalSetup: ['./e2e/global-setup.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    fileParallelism: false
  }
})
