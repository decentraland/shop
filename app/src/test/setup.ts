import { beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

/**
 * Neutralise the local dev flag overrides for every test.
 *
 * `VITE_FEATURE_FLAG_OVERRIDES` (see lib/featureFlags devOverrideFor) exists so a developer can exercise a
 * flag-gated flow locally from `.env.local`. Vite loads that file for `vitest` too, and the override is
 * applied AFTER the flag service answers — so it outranks whatever a test arranged, and the suite starts
 * reporting on the developer's config instead of on the code.
 *
 * It failed exactly one case, which is the worst version of this: `trades.spec.ts`'s "no secondary sales at
 * all" arms the flag OFF, the local override turned it back ON, and the failure looked like a flaky or stale
 * test rather than a leaked environment. CI has no `.env.local`, so it passed there and the discrepancy read
 * as "known local failure" for weeks.
 *
 * Set here rather than per spec: any test touching a flag is exposed, not just the one that happened to break.
 */
beforeEach(() => {
  ;(import.meta.env as Record<string, unknown>).VITE_FEATURE_FLAG_OVERRIDES = ''
})
