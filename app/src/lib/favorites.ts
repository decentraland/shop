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
// scoped per user). Same UUID in every environment.
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
  const url = `${config.marketplaceServerUrl}/v1/picks/${itemKey}`
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
