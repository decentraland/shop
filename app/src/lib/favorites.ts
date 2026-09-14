import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Signed-in favorites live server-side in the marketplace favorites service ("picks"), so they sync
// across devices and with the marketplace site. Signed-out favorites stay in localStorage (see
// store/favorites.ts). Both endpoints are ADR-44 signed-fetch, same as the credits-server calls.
//
// Picks are keyed by the marketplace item id `<contractAddress>-<itemId>` — NOT CatalogItem.id,
// which is the trade id on the shop feeds (per-listing and ephemeral). Only primary items exist in
// the service; a per-token (secondary-only) row can't be favorited.

// The global default "Favorites" list — a single well-known row shared by every account (picks are
// scoped per user, server-side). Same UUID in every environment; seeded in the marketplace-server DB.
export const DEFAULT_LIST_ID = '70ab6873-4a03-4eb2-b331-4b8be0e0b8af'

// Stable favorite identity for an item, or null when it has none (no itemId → not favoritable).
export function favoriteKey(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): string | null {
  if (!item.contractAddress || !item.itemId) return null
  return `${item.contractAddress.toLowerCase()}-${item.itemId}`
}

// Favorites responses come in the marketplace `{ ok, data }` envelope; `ok: false` can arrive on an
// HTTP 200, so both must be checked.
type Envelope<T> = { ok: boolean; message?: string; data: T }
type PicksPage = { results: { itemId: string; createdAt: number }[]; total: number }

const PAGE_SIZE = 100

// Every favorited item id for the signed-in account (newest first), paging until exhausted.
export async function fetchFavoriteIds(identity: AuthIdentity): Promise<string[]> {
  const ids: string[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${config.marketplaceServerUrl}/v1/lists/${DEFAULT_LIST_ID}/picks?limit=${PAGE_SIZE}&offset=${offset}`
    const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
    if (!res.ok) throw new Error(`fetchFavoriteIds ${res.status}`)
    const body = (await res.json()) as Envelope<PicksPage>
    if (!body.ok) throw new Error(`fetchFavoriteIds: ${body.message ?? 'not ok'}`)
    ids.push(...body.data.results.map(r => r.itemId))
    if (ids.length >= body.data.total || body.data.results.length === 0) return ids
  }
}

// Pick (faved) or unpick (!faved) an item on the default list for the signed-in account.
export async function setFavorite(itemKey: string, faved: boolean, identity: AuthIdentity): Promise<void> {
  const url = `${config.marketplaceServerUrl}/v1/picks/${encodeURIComponent(itemKey)}`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(faved ? { pickedFor: [DEFAULT_LIST_ID] } : { unpickedFrom: [DEFAULT_LIST_ID] })
  })
  if (!res.ok) throw new Error(`setFavorite ${res.status}`)
  const body = (await res.json().catch(() => null)) as Envelope<unknown> | null
  if (body && !body.ok) throw new Error(`setFavorite: ${body.message ?? 'not ok'}`)
}

export type FavoriteStats = { count: number; pickedByUser: boolean }

// How many accounts have saved an item, and whether one particular account is among them.
//
// Every card in a grid asks for its own number in the same frame, so the asks are coalesced: keys
// requested inside one short window leave as a single bulk read rather than one request per card.
// `checkingUserAddress` is what brings `pickedByUser` back and needs no signature — who saved an item
// is public (the service lists the addresses).
const STATS_BATCH_MS = 10
const STATS_BATCH_SIZE = 50

type StatsWaiter = { resolve: (stats: FavoriteStats) => void; reject: (error: unknown) => void }

// account address ('' signed out) → item key → everyone waiting on that key
const statsPending = new Map<string, Map<string, StatsWaiter[]>>()
let statsFlush: ReturnType<typeof setTimeout> | null = null

export function fetchFavoriteStats(itemKey: string, address?: string | null): Promise<FavoriteStats> {
  const group = address?.toLowerCase() ?? ''
  return new Promise<FavoriteStats>((resolve, reject) => {
    let keys = statsPending.get(group)
    if (!keys) {
      keys = new Map()
      statsPending.set(group, keys)
    }
    const waiters = keys.get(itemKey) ?? []
    waiters.push({ resolve, reject })
    keys.set(itemKey, waiters)
    statsFlush ??= setTimeout(() => void flushFavoriteStats(), STATS_BATCH_MS)
  })
}

async function flushFavoriteStats(): Promise<void> {
  statsFlush = null
  const groups = [...statsPending]
  statsPending.clear()
  await Promise.all(
    groups.flatMap(([address, keys]) => {
      const all = [...keys.keys()]
      const chunks: string[][] = []
      for (let i = 0; i < all.length; i += STATS_BATCH_SIZE) chunks.push(all.slice(i, i + STATS_BATCH_SIZE))
      return chunks.map(async chunk => {
        try {
          const stats = await fetchStatsChunk(chunk, address)
          // The service answers for every id it was asked about, but a missing row still means zero
          // saves — never a pending promise.
          for (const key of chunk) {
            const row = stats.get(key) ?? { count: 0, pickedByUser: false }
            keys.get(key)?.forEach(waiter => waiter.resolve(row))
          }
        } catch (error) {
          for (const key of chunk) keys.get(key)?.forEach(waiter => waiter.reject(error))
        }
      })
    })
  )
}

async function fetchStatsChunk(itemKeys: string[], address: string): Promise<Map<string, FavoriteStats>> {
  const qs = new URLSearchParams()
  for (const key of itemKeys) qs.append('itemId', key)
  if (address) qs.append('checkingUserAddress', address)
  const res = await fetch(`${config.marketplaceServerUrl}/v1/picks/stats?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchFavoriteStats ${res.status}`)
  const body = (await res.json()) as Envelope<{ itemId: string; count: number; pickedByUser?: boolean }[]>
  if (!body.ok) throw new Error(`fetchFavoriteStats: ${body.message ?? 'not ok'}`)
  return new Map(body.data.map(row => [row.itemId, { count: row.count, pickedByUser: !!row.pickedByUser }]))
}
