// Centralised error reporting for the shop. Two jobs:
//  1. ALWAYS surface failures in the console — most catch blocks previously only showed a toast
//     and swallowed the real error, so bugs (like a reverting on-chain call) were invisible.
//  2. Forward every captured error to Sentry when it's configured. `captureError` stays decoupled
//     via a forwarder seam; `initSentry()` wires the seam to Sentry.captureException.
//
// Convention: pass a `flow` in the context (e.g. { flow: 'remove-listing' }) so both the console
// and Sentry group failures by user action. Never put secrets in the context (org policy) — and
// `beforeSend` scrubs defensively anyway.
import * as Sentry from '@sentry/react'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'

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

// ---------------------------------------------------------------------------------------------
// Sentry wiring — PII/secret scrubbing.
// Wallet address is PUBLIC on-chain (OK to attach); signatures, ephemeral identity keys, bearer
// tokens and Stripe secrets must NEVER leave the device. These run on every outgoing event.
const SIGNATURE_RE = /0x[a-fA-F0-9]{130}\b/g // 65-byte ECDSA signatures
const HEX32_RE = /0x[a-fA-F0-9]{64}\b/g // 32-byte values (ephemeral private keys, hashes)
const SECRET_RE = /(sk_[a-z]+_[A-Za-z0-9]+|pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+|[A-Za-z0-9-]*secret[A-Za-z0-9-]*)/gi
const SENSITIVE_KEY =
  /(signature|private|identity|authchain|auth_chain|ephemeral|token|secret|password|cookie|authorization)/i

/** Redact secret-shaped substrings from free text (messages, exception values, urls). */
export function redact(input: string): string {
  return input.replace(SIGNATURE_RE, '<signature>').replace(SECRET_RE, '<secret>').replace(HEX32_RE, '<hex32>')
}

/** Scrub an outgoing Sentry event: redact free text, drop sensitive keys, strip cookies/headers. */
export function scrubEvent(event: Sentry.Event): Sentry.Event {
  if (event.message) event.message = redact(event.message)
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = redact(ex.value)
  for (const b of event.breadcrumbs ?? []) if (b.message) b.message = redact(b.message)
  if (event.request) {
    if (event.request.url) event.request.url = redact(event.request.url)
    delete event.request.cookies
    delete event.request.headers
  }
  const clean = (o?: Record<string, unknown>) => {
    if (!o) return
    for (const k of Object.keys(o)) {
      if (SENSITIVE_KEY.test(k)) {
        delete o[k]
        continue
      }
      if (typeof o[k] === 'string') o[k] = redact(o[k] as string)
    }
  }
  clean(event.tags as Record<string, unknown> | undefined)
  clean(event.extra as Record<string, unknown> | undefined)
  return event
}

let initialized = false

/**
 * Initialise Sentry. NO-OP unless VITE_SENTRY_DSN is set, so local/dev never sends. Safe to call
 * once at startup. Once live, every captureError(...) is forwarded to Sentry (scrubbed).
 */
export function initSentry(): void {
  if (initialized) return
  const dsn = config.sentryDsn
  if (!dsn) {
    // eslint-disable-next-line no-console
    if (import.meta.env.DEV) console.debug('[monitoring] no VITE_SENTRY_DSN → error reporting disabled')
    return
  }
  initialized = true
  Sentry.init({
    dsn,
    environment: config.sentryEnvironment,
    release: config.sentryRelease,
    integrations: [new Sentry.BrowserTracing()],
    tracesSampleRate: 0.01,
    sendDefaultPii: false,
    // Expected user actions, not bugs.
    ignoreErrors: [/user rejected/i, /user denied/i, 'ResizeObserver loop limit exceeded'],
    beforeSend: scrubEvent
  })
  const addr = safeAddress()
  if (addr) Sentry.setUser({ id: addr })
  setErrorForwarder((error, context) => Sentry.captureException(error, { extra: context }))
}

/** Attach/detach the wallet as the Sentry user (address is public). Call on sign-in / disconnect. */
export function setMonitoringUser(address: string | null): void {
  if (!initialized) return
  Sentry.setUser(address ? { id: address.toLowerCase() } : null)
}

function safeAddress(): string | null {
  try {
    return useWallet.getState().session?.address ?? null
  } catch {
    return null
  }
}
