import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Separate from vite.config.ts: vitest bundles its own vite, so keeping plugin/type graphs apart
// avoids dual-vite type conflicts. The react plugin is cast to bypass that nested-vite typing.
export default defineConfig({
  // `~/config` reads the release from a build-time constant rather than an env var (see vite.config.ts);
  // without a value here every test that imports the config would blow up on an undefined global.
  define: { __SENTRY_RELEASE__: JSON.stringify('shop@test') },
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
    // Tests resolve the 'dev' config, which now ships real client keys (see src/config/env/dev.json).
    // Blank them so unit tests force the payments MOCK path (empty Stripe key flips isMockPayments on)
    // and keep Segment/Sentry OFF (no analytics load, no error reports). Kept out of the per-env JSON so
    // only tests are blanked, not the dev deploy.
    env: { VITE_STRIPE_PK: '', VITE_SEGMENT_WRITE_KEY: '', VITE_SENTRY_DSN: '' },
    // @dcl/ui-env ships extensionless internal imports (dist/index.js → './config') that Vitest's
    // resolver can't follow; inlining it routes the dep through Vite's resolver, which can.
    // decentraland-transactions has the same shape — its ESM entry re-exports a DIRECTORY — which is why
    // every spec touching it has had to mock it. Inlining lets the lockstep guard use the real registry,
    // which is the one thing a mock cannot stand in for.
    server: { deps: { inline: ['@dcl/ui-env', 'decentraland-transactions'] } },
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
