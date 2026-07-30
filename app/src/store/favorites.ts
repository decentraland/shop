import { create } from 'zustand'
import type { AuthIdentity } from '@dcl/crypto'
import { fetchCatalogByIds, type CatalogItem } from '~/lib/api'
import { favoriteKey, fetchFavoriteIds, setFavorite } from '~/lib/favorites'
import { captureError } from '~/lib/monitoring'
import { toast } from '~/store/toast'
import { t } from '~/intl/i18n'

// Favorites have two homes. SIGNED IN: the marketplace favorites service is the source of truth
// (synced across devices and with the marketplace site); toggles are optimistic with a rollback +
// toast on failure. SIGNED OUT: localStorage, so hearting works before ever signing in. The wallet
// store calls reloadFor() on every session boundary (sign-in / restore / sign-out) to swap modes.
//
// Items are keyed by favoriteKey (`contract-itemId`) in BOTH modes — never CatalogItem.id, which is
// the trade id on shop feeds. Rows with no derivable key (per-token secondary rows, NAMEs) can't be
// favorited; consumers hide the heart for them. We keep the full CatalogItem per key so the
// My Favorites page renders the anonymous bucket without refetching.
const BASE_KEY = 'shop-favorites'

// Current mode, module-level so actions stay in sync with the last reloadFor() without threading it
// through every call. `epoch` guards in-flight async work against a session switch racing it.
// `toggleGen` tracks per-key in-flight toggle generation so a superseded rollback doesn't stomp a
// newer toggle of the same item.
let account: string | null = null
let identity: AuthIdentity | null = null
let epoch = 0
const toggleGen = new Map<string, number>()

type Items = Record<string, CatalogItem>

function keyItems(items: CatalogItem[]): Items {
  const out: Items = {}
  for (const item of items) {
    const key = favoriteKey(item)
    if (key) out[key] = item
  }
  return out
}

function loadLocal(): Items {
  try {
    const raw = localStorage.getItem(BASE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as object
    if (!parsed || typeof parsed !== 'object') return {}
    // Tolerate the legacy zustand-persist envelope ({ state: { items }, version }) so anonymous
    // favorites saved before this store was namespaced still hydrate.
    const envelope = parsed as { state?: { items?: object } }
    const items = 'state' in parsed && envelope.state?.items ? envelope.state.items : parsed
    if (!items || typeof items !== 'object') return {}
    // Re-key by favoriteKey: older snapshots were keyed by CatalogItem.id (the trade id on shop
    // feeds). Entries with no derivable key are dropped — they can no longer be favorited.
    const rekeyed = keyItems(Object.values(items as Items))
    saveLocal(rekeyed)
    return rekeyed
  } catch {
    return {}
  }
}

function saveLocal(items: Items): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(items))
  } catch {
    // best-effort (private mode / quota) — favorites still work for the session
  }
}

type FavState = {
  items: Items
  // Server hydration state; the anonymous bucket is always 'ready' (synchronous localStorage).
  status: 'ready' | 'loading' | 'error'
  toggle: (item: CatalogItem) => void
  // Swap mode on a session boundary: server-backed for addr+identity, anonymous bucket otherwise.
  reloadFor: (addr: string | null, authIdentity?: AuthIdentity) => void
  // Re-run a failed server hydration (the My Favorites error state's Try again).
  retry: () => void
}

export { favoriteKey } from '~/lib/favorites'

export const useFavorites = create<FavState>((set, get) => {
  async function hydrate(): Promise<void> {
    const started = ++epoch
    set({ items: {}, status: 'loading' })
    try {
      const ids = await fetchFavoriteIds(identity!)
      const catalog = await fetchCatalogByIds(ids)
      if (epoch !== started) return
      set({ items: keyItems(catalog), status: 'ready' })
    } catch (e) {
      if (epoch !== started) return
      captureError(e, { flow: 'favorites', step: 'hydrate' })
      set({ status: 'error' })
    }
  }

  return {
    items: loadLocal(),
    status: 'ready',
    toggle: item => {
      const key = favoriteKey(item)
      if (!key) return
      const wasFaved = !!get().items[key]
      const gen = (toggleGen.get(key) ?? 0) + 1
      toggleGen.set(key, gen)
      set(s => {
        const items = { ...s.items }
        if (wasFaved) delete items[key]
        else items[key] = item
        if (!account) saveLocal(items)
        return { items }
      })
      if (!account || !identity) return
      const started = epoch
      setFavorite(key, !wasFaved, identity).catch(e => {
        captureError(e, { flow: 'favorites', step: 'toggle' })
        if (epoch !== started || toggleGen.get(key) !== gen) return
        set(s => {
          const items = { ...s.items }
          if (wasFaved) items[key] = item
          else delete items[key]
          return { items }
        })
        toast.error(t('favorites.updateError'))
      })
    },
    reloadFor: (addr, authIdentity) => {
      account = addr ? addr.toLowerCase() : null
      identity = authIdentity ?? null
      if (account && identity) {
        void hydrate()
      } else {
        epoch++
        set({ items: loadLocal(), status: 'ready' })
      }
    },
    retry: () => {
      if (account && identity) void hydrate()
    }
  }
})

export function useFavorite(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>) {
  const key = favoriteKey(item)
  const faved = useFavorites(s => !!key && !!s.items[key])
  const toggle = useFavorites(s => s.toggle)
  return { key, faved, toggle }
}
