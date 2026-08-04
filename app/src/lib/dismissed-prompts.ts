// One-off prompts the user has opted out of via "don't show this again", persisted in localStorage.
// Best-effort — never throws (storage can be full/disabled).
//
// Scoped PER ACCOUNT rather than globally: on a shared browser, or after switching accounts, one
// seller's opt-out must not silence the prompt for the next. Without an address nothing is read or
// written — a signed-out visitor has no account to attach the choice to.
//
// Dismissal is PERMANENT, with no expiry. "Don't show this again" is a promise, and re-asking after a
// timeout breaks it; the prompt is self-limiting anyway, since it only fires while the seller still
// has classic listings left to move.
const KEY = 'shop:dismissed-prompts'

/** The My Assets prompt that points sellers at the credit-pricing migration. */
export const MANA_PRICING_PROMPT = 'mana-pricing'

type Store = Record<string, string[]>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Store
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // ignore storage failures — the prompt showing again is a far better outcome than a broken page
  }
}

// Addresses reach us in mixed case depending on the provider, so the bucket key is normalized.
function accountKey(address?: string | null): string | null {
  return address ? address.toLowerCase() : null
}

export function isPromptDismissed(prompt: string, address?: string | null): boolean {
  const account = accountKey(address)
  if (!account) return false
  const dismissed = read()[account]
  return Array.isArray(dismissed) && dismissed.includes(prompt)
}

export function dismissPrompt(prompt: string, address?: string | null): void {
  const account = accountKey(address)
  if (!account) return
  const store = read()
  const dismissed = Array.isArray(store[account]) ? store[account] : []
  if (dismissed.includes(prompt)) return
  write({ ...store, [account]: [...dismissed, prompt] })
}

/** Undoes a dismissal — the reset path for QA, and how the specs restore a clean slate. */
export function resetPrompt(prompt: string, address?: string | null): void {
  const account = accountKey(address)
  if (!account) return
  const store = read()
  const dismissed = Array.isArray(store[account]) ? store[account] : []
  if (!dismissed.includes(prompt)) return
  write({ ...store, [account]: dismissed.filter(p => p !== prompt) })
}
