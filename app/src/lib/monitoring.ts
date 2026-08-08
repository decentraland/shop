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

/**
 * A thrown value Sentry can put a NAME on, derived from one it cannot.
 *
 * Wallet and JSON-RPC failures arrive as plain objects — `{ code, message, data, stack }` — not Errors.
 * Sentry cannot read a title off a plain object, so it falls back to the frame that captured it, which
 * is its own minified `captureException`. That is how four separate production issues ended up titled
 * `ds`, hiding eleven real purchase failures behind a name nobody would ever click: a Coinbase Wallet
 * `-32603 Failed to fetch` mid-purchase, and a cart checkout rejected by the RPC with a 401.
 *
 * Errors pass through untouched. A plain object carrying a string `message` becomes an Error titled with
 * it, plus its `code` when it has one — that code is what separates a dead RPC from a user rejection.
 *
 * The ORIGINAL STACK is transplanted when the object has one, and that is the load-bearing part: a fresh
 * Error's stack points here, at monitoring.ts, so without it every wallet failure in the app would group
 * into one meaningless issue — trading an unreadable title for unreadable grouping. The original object
 * rides along as `cause`, and the caller's context still reaches Sentry untouched.
 */
export function toReportable(value: unknown): unknown {
  if (value instanceof Error || !value || typeof value !== 'object') return value
  const raw = value as { message?: unknown; code?: unknown; stack?: unknown }
  if (typeof raw.message !== 'string' || raw.message === '') return value

  const code = typeof raw.code === 'string' || typeof raw.code === 'number' ? ` (code ${raw.code})` : ''
  const error = new Error(`${raw.message}${code}`)
  // `cause` is assigned rather than passed to the constructor: that overload is ES2022 and this builds
  // against ES2020.
  ;(error as Error & { cause?: unknown }).cause = value
  if (typeof raw.stack === 'string' && raw.stack !== '') error.stack = raw.stack
  return error
}

/** Log an error to the console (always) and forward it to the reporter (if wired). Never throws. */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  const label = typeof context.flow === 'string' ? `error in ${context.flow}` : 'error'

  // The console gets the value as thrown; only the report needs the nameable shape.
  console.error(`[shop] ${label}`, error, context)
  if (forward) {
    try {
      forward(toReportable(error), context)
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
      if (typeof o[k] === 'string') o[k] = redact(o[k])
    }
  }
  clean(event.tags)
  clean(event.extra)
  return event
}

/**
 * The low-cardinality context fields worth INDEXING, promoted from `extra` to Sentry tags.
 *
 * Sentry does not index `extra`: it cannot be searched, filtered, grouped or charted — only read once
 * an event is already open. So every `captureError(err, { flow, step })` in the shop was effectively
 * invisible to search, and answering "how often does the MANA price read fail in prod" meant opening
 * events one by one. `flow` and `step` are a closed set of short identifiers, which is what a tag is for.
 *
 * ONLY those two are promoted, never the whole context — the rest carries ids, addresses and amounts
 * that would blow past Sentry's tag-cardinality limits and make the tag useless as a facet. Non-string
 * values are dropped rather than coerced: a tag is a label, and `[object Object]` is not one.
 *
 * Both still travel in `extra` as well, so nothing that used to be readable stops being readable. And
 * they are scrubbed on the way out either way — `scrubEvent` cleans `event.tags` exactly as it cleans
 * `event.extra`.
 */
export function tagsFrom(context: ErrorContext): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const key of ['flow', 'step'] as const) {
    const value = context[key]
    if (typeof value === 'string' && value !== '') tags[key] = value
  }
  return tags
}

/**
 * The sink `initSentry` wires into the forwarder seam. Named and exported rather than inlined so the
 * tag promotion is reachable from a test: inlined, deleting `tags` there passed every test in the file.
 */
export function sentryForwarder(error: unknown, context: ErrorContext): void {
  Sentry.captureException(error, { tags: tagsFrom(context), extra: context })
}

let initialized = false

/**
 * True on local hosts (dev server, `vite preview`, e2e). localhost shares dev.json's config, so
 * without this guard it would report to the dev/zone Sentry DSN — we never want local noise in Sentry.
 */
export function isLocalhost(hostname: string = typeof location !== 'undefined' ? location.hostname : ''): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  )
}

/**
 * Initialise Sentry. NO-OP on localhost (dev server / preview / e2e) and unless a DSN is set, so
 * local never sends. Deployed zone/stg/prod each report with their own `environment` tag. Safe to
 * call once at startup. Once live, every captureError(...) is forwarded to Sentry (scrubbed).
 */
export function initSentry(): void {
  if (initialized) return
  // localhost shares dev.json (which now carries the dev/zone DSN) — never report from local.
  if (isLocalhost()) {
    if (import.meta.env.DEV) console.debug('[monitoring] localhost → Sentry disabled')
    return
  }
  const dsn = config.sentryDsn
  if (!dsn) {
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
  setErrorForwarder(sentryForwarder)
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
