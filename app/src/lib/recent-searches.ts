// Client-side "recent searches" list, persisted in localStorage (no backend). Most-recent-first,
// deduped case-insensitively, capped. Best-effort — never throws (storage can be full/disabled).
// Mirrors the shape of lib/recently-viewed.ts.
const KEY = 'shop:recent-searches'
const MAX_ITEMS = 8

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const items = JSON.parse(raw) as unknown
    if (!Array.isArray(items)) return []
    return items.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

export function recordSearch(query: string): void {
  const q = query.trim()
  if (!q) return
  try {
    const next = [q, ...getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX_ITEMS)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures — recent searches are a nice-to-have
  }
}

export function removeRecentSearch(query: string): void {
  try {
    const next = getRecentSearches().filter(s => s.toLowerCase() !== query.trim().toLowerCase())
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
