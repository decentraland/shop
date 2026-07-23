// A gated action a signed-out user triggered (cart checkout, buy-now, …) that we want to finish for
// them after they sign in. Sign-in redirects the whole page to the auth app and back (window.location,
// see lib/auth.signInRedirect), which returns to the exact URL they left — so the "return to where you
// were" part is inherent. React Router state, however, is wiped across that full-page round-trip, so we
// stash the intent in sessionStorage (same-origin, survives the redirect — the same trick as
// RESUME_BUY_KEY) and the page it returns to consumes it once the session is restored.

const RESUME_KEY = 'shop:resume_after_signin'

// A stashed intent older than this is treated as abandoned (the user backed out of the auth app) and
// dropped, so it can never resurrect a later, unrelated sign-in.
const MAX_AGE_MS = 15 * 60 * 1000

export type ResumeIntent = { type: 'cart-checkout' } | { type: 'item-buy'; path: string }

type StoredIntent = ResumeIntent & { at: number }

export function stashResumeIntent(intent: ResumeIntent): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ ...intent, at: Date.now() }))
  } catch {
    // Private mode / storage full: the resume just won't auto-trigger — sign-in still returns here.
  }
}

// Read-and-clear the pending intent. Returns it only when it matches `type` and is still fresh; a
// mismatched or stale entry yields null (and is cleared, so it can't linger). Consuming on read keeps
// the resume strictly one-shot.
export function takeResumeIntent<T extends ResumeIntent['type']>(type: T): Extract<ResumeIntent, { type: T }> | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(RESUME_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    sessionStorage.removeItem(RESUME_KEY)
  } catch {
    // ignore
  }
  let parsed: StoredIntent
  try {
    parsed = JSON.parse(raw) as StoredIntent
  } catch {
    return null
  }
  if (!parsed || parsed.type !== type) return null
  if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) return null
  // Rebuild without the `at` timestamp so the caller gets a clean ResumeIntent.
  const intent: ResumeIntent =
    parsed.type === 'cart-checkout' ? { type: 'cart-checkout' } : { type: 'item-buy', path: parsed.path }
  return intent as Extract<ResumeIntent, { type: T }>
}
