import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'
import { toCatalogItem, type RawCollectionItem } from '~/lib/catalogItem'

// ---------------------------------------------------------------------------
// The search-bar suggestions, in one request.
//
// GET /v3/catalog/suggest answers the three sections the dropdown stacks — items, collections and
// creators — ranked by the same matching the results grid uses, with `total` being what the grid the
// query opens will report. Every item and collection row already names its creator, so the dropdown
// resolves no profiles. It replaced three requests per keystroke (the items feed, /v1/collections by
// substring and the creators search) plus a profile lookup per row.
// ---------------------------------------------------------------------------

export type SuggestedItem = CatalogItem & {
  // What to call the creator, resolved server-side; null when the creator has no known name.
  creatorName: string | null
}

export type CollectionHit = {
  contractAddress: string
  name: string
  creator: string
  creatorName: string | null
  items: number
  sales: number
}

export type CreatorHit = {
  address: string
  name: string
  face?: string
}

export type Suggestions = {
  items: SuggestedItem[]
  // Items the grid the query opens will show, i.e. the "See all (N)" number.
  total: number
  collections: CollectionHit[]
  creators: CreatorHit[]
}

export const EMPTY_SUGGESTIONS: Suggestions = { items: [], total: 0, collections: [], creators: [] }

export type SuggestionSizes = { items?: number; collections?: number; creators?: number }

type RawSuggestions = {
  items?: { data?: (RawCollectionItem & { creatorName?: string | null })[]; total?: number }
  collections?: { data?: Partial<CollectionHit>[] }
  creators?: { data?: { address?: string; name?: string; face?: string | null }[] }
}

export async function fetchSuggestions(
  search: string,
  { items = 5, collections = 4, creators = 4 }: SuggestionSizes = {}
): Promise<Suggestions> {
  const term = search.trim()
  if (!term) return EMPTY_SUGGESTIONS
  const qs = new URLSearchParams({
    search: term,
    items: String(items),
    collections: String(collections),
    creators: String(creators)
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/suggest?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchSuggestions ${res.status}`)
  const body = (await res.json()) as RawSuggestions
  return {
    items: (body.items?.data ?? []).map(row => ({ ...toCatalogItem(row), creatorName: row.creatorName ?? null })),
    total: body.items?.total ?? 0,
    collections: (body.collections?.data ?? [])
      .filter(c => c.contractAddress && c.name)
      .map(c => ({
        contractAddress: c.contractAddress!,
        name: c.name!,
        creator: c.creator ?? '',
        creatorName: c.creatorName ?? null,
        items: c.items ?? 0,
        sales: c.sales ?? 0
      })),
    creators: (body.creators?.data ?? [])
      .filter(c => c.address && c.name)
      .map(c => ({ address: c.address!.toLowerCase(), name: c.name!, face: c.face ?? undefined }))
  }
}
