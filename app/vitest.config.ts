import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Separate from vite.config.ts: vitest bundles its own vite, so keeping plugin/type graphs apart
// avoids dual-vite type conflicts. The react plugin is cast to bypass that nested-vite typing.
export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    // Force the payments MOCK path in unit tests: tests resolve the 'dev' config, which now ships a
    // real Stripe publishable key (see src/config/env/dev.json), and an empty key is what flips
    // isMockPayments() on. Kept out of the per-env JSON so only tests are mock, not the dev deploy.
    env: { VITE_STRIPE_PK: '' },
    // @dcl/ui-env ships extensionless internal imports (dist/index.js → './config') that Vitest's
    // resolver can't follow; inlining it routes the dep through Vite's resolver, which can.
    server: { deps: { inline: ['@dcl/ui-env'] } },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      include: ['src/**'],
      exclude: ['src/**/*.spec.*', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts', 'src/**/*.d.ts'],
      // Lock in the logic layer (lib/store). Pages/components are exercised by the e2e suite,
      // so we don't gate on their unit coverage here.
      thresholds: {
        'src/lib/**': { statements: 90, branches: 88, functions: 90, lines: 90 },
        'src/store/**': { statements: 95, branches: 90, functions: 78, lines: 95 }
      }
    }
  }
})
