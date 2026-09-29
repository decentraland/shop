// What the last successful My Creations load looked like, per account, kept in localStorage.
//
// It exists for one reason: the creations read goes to the builder-server and is the slowest thing on
// My Assets, so an account that showed creations before gets that read started the moment the page
// mounts, instead of when the tab is clicked — and the skeleton is sized to the count last seen, so the
// grid does not jump when the real cards land. It is a hint, never the truth: the query result always
// wins, and a wrong hint costs one early request or a skeleton of the wrong length, nothing more.
//
// Best-effort like the other localStorage helpers: never throws (storage can be full or disabled).
const KEY = 'shop:creations-hint:v1'

export type CreationsHint = { count: number }

type Stored = Record<string, CreationsHint>

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

/** The hint for an account, or null when it never loaded creations (or loaded none). */
export function readCreationsHint(address?: string | null): CreationsHint | null {
  if (!address) return null
  const hint = load()[address.toLowerCase()]
  return hint && Number.isFinite(hint.count) && hint.count > 0 ? { count: hint.count } : null
}

/** Remember how many creations an account has; zero forgets, so a non-creator never gets the early read. */
export function writeCreationsHint(address: string, count: number): void {
  try {
    const stored = load()
    const key = address.toLowerCase()
    if (count > 0) stored[key] = { count }
    else delete stored[key]
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // ignore storage failures — the hint is a nice-to-have
  }
}
