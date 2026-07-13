import { create } from 'zustand'
import type { CatalogItem } from '~/lib/api'

// Favorites persist across sessions (localStorage), NAMESPACED per signed-in account so a shared
// device or an account switch never shows one account's favorites to another. Signed-out
// (anonymous) favorites live under the base key; the wallet store calls reloadFor() on every
// session boundary (sign-in / restore / sign-out) to swap buckets. We store the full CatalogItem
// so the My Favorites page can render + deep-link without refetching.
const BASE_KEY = 'shop-favorites'

// The account whose bucket is currently loaded (null = anonymous). Module-level so reads/writes
// below stay in sync with the last reloadFor() without threading it through every action.
let account: string | null = null
const keyFor = (addr: string | null): string => (addr ? `${BASE_KEY}:${addr.toLowerCase()}` : BASE_KEY)

type Items = Record<string, CatalogItem>

function load(addr: string | null): Items {
  try {
    const raw = localStorage.getItem(keyFor(addr))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    // Tolerate the legacy zustand-persist envelope ({ state: { items }, version }) so anonymous
    // favorites saved before this store was namespaced still hydrate.
    const items = 'state' in parsed && parsed.state?.items ? parsed.state.items : parsed
    return items && typeof items === 'object' ? (items as Items) : {}
  } catch {
    return {}
  }
}

function save(items: Items): void {
  try {
    localStorage.setItem(keyFor(account), JSON.stringify(items))
  } catch {
    // best-effort (private mode / quota) — favorites still work for the session
  }
}

type FavState = {
  items: Items
  toggle: (item: CatalogItem) => void
  remove: (id: string) => void
  // Swap to a different account's bucket (or the anonymous bucket when addr is null). Called by the
  // wallet store so favorites never leak across accounts on a shared device.
  reloadFor: (addr: string | null) => void
}

export const useFavorites = create<FavState>(set => ({
  items: load(account),
  toggle: item =>
    set(s => {
      const items = { ...s.items }
      if (items[item.id]) delete items[item.id]
      else items[item.id] = item
      save(items)
      return { items }
    }),
  remove: id =>
    set(s => {
      const items = { ...s.items }
      delete items[id]
      save(items)
      return { items }
    }),
  reloadFor: addr => {
    account = addr ? addr.toLowerCase() : null
    set({ items: load(account) })
  }
}))
