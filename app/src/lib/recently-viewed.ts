import type { CatalogItem } from '~/lib/api'

// Client-side "recently viewed" list, persisted in localStorage (no backend). Most-recent-first,
// deduped by id, capped. Best-effort — never throws (storage can be full/disabled).
const KEY = 'shop:recently-viewed'
const MAX = 12

export function getRecentlyViewed(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const items = JSON.parse(raw) as CatalogItem[]
    return Array.isArray(items) ? items.slice(0, MAX) : []
  } catch {
    return []
  }
}

export function recordViewed(item: CatalogItem): void {
  if (!item?.id) return
  try {
    const next = [item, ...getRecentlyViewed().filter(i => i.id !== item.id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures — recently-viewed is a nice-to-have
  }
}
