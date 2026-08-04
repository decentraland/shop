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

/**
 * The user's own recent toggles, stamped with a sequence number, so a hydrate cannot rewind them.
 *
 * A hydrate answers with the list as it was when its FIRST request was issued. Toggle anywhere inside that
 * window and applying the reply verbatim discards the heart the user just clicked, even though its POST goes
 * on to succeed — which is exactly the "favorited it, opened My Favorites, it wasn't there until I reloaded"
 * report: the server had it, only the in-memory list had been rewound to an older snapshot.
 *
 * Keyed on a SEQUENCE rather than on whether the POST has settled, because settling is the wrong signal: a
 * POST that finishes first still does not make the hydrate's already-issued GET any fresher. So a hydrate
 * re-applies every toggle stamped after it started, and prunes the older ones it has demonstrably caught up
 * with. A failed toggle removes its own entry — its rollback has restored the previous state, and leaving it
 * here would let a later hydrate re-apply a change the server rejected.
 */
let toggleSeq = 0
const recentToggles = new Map<string, { item: CatalogItem; faved: boolean; seq: number }>()

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
    // Everything toggled from here on is NEWER than the list this hydrate is about to read.
    const seqAtStart = toggleSeq
    set({ items: {}, status: 'loading' })
    try {
      const ids = await fetchFavoriteIds(identity!)
      const catalog = await fetchCatalogByIds(ids)
      if (epoch !== started) return
      // Server list first, then re-apply anything toggled while the two requests above were in flight —
      // without this the list is correct for the moment the fetch STARTED, not for now.
      const items = keyItems(catalog)
      for (const [key, toggled] of recentToggles) {
        if (toggled.seq <= seqAtStart) {
          // This hydrate's read is newer than the toggle, so its answer already accounts for it.
          recentToggles.delete(key)
          continue
        }
        if (toggled.faved) items[key] = toggled.item
        else delete items[key]
      }
      set({ items, status: 'ready' })
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
      // Recorded only on the server-backed path: signed out there is no hydrate to race.
      recentToggles.set(key, { item, faved: !wasFaved, seq: ++toggleSeq })
      setFavorite(key, !wasFaved, identity).catch(e => {
        // Guarded on the generation so a slow failure does not drop a NEWER toggle of the same item, which
        // would leave that newer one unprotected against a hydrate still in flight.
        if (toggleGen.get(key) === gen) recentToggles.delete(key)
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
      // A session boundary invalidates anything still in flight: those toggles belong to the account that
      // is being swapped out, and re-applying them over the NEW account's list would show one account's
      // favorites to another.
      recentToggles.clear()
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
