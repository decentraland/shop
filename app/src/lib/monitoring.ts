// Centralised error reporting for the shop. Two jobs:
//  1. ALWAYS surface failures in the console — most catch blocks previously only showed a toast
//     and swallowed the real error, so bugs (like a reverting on-chain call) were invisible.
//  2. A single seam to forward every captured error to Sentry once it's wired, without this
//     module taking a hard dependency on the SDK. `initMonitoring()` (added with Sentry) calls
//     `setErrorForwarder(...)`; until then captureError just logs.
//
// Convention: pass a `flow` in the context (e.g. { flow: 'remove-listing' }) so both the console
// and Sentry group failures by user action. Never put secrets in the context (org policy).

export type ErrorContext = Record<string, unknown>

let forward: ((error: unknown, context: ErrorContext) => void) | null = null

/** Wire a downstream sink (Sentry) for captured errors. Passing null disables forwarding. */
export function setErrorForwarder(fn: ((error: unknown, context: ErrorContext) => void) | null): void {
  forward = fn
}

/** Log an error to the console (always) and forward it to the reporter (if wired). Never throws. */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  const label = typeof context.flow === 'string' ? `error in ${context.flow}` : 'error'
  // eslint-disable-next-line no-console
  console.error(`[shop] ${label}`, error, context)
  if (forward) {
    try {
      forward(error, context)
    } catch {
      // reporting must never throw back into the caller's catch block
    }
  }
}
