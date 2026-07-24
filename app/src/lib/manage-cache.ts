import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { MyAsset } from '~/lib/api'

// One owned wearable/emote token, identified across every cache that renders its sale state. `address`
// scopes the my-assets grid + owned-token detail queries to the connected wallet.
export type ManageTarget = {
  address?: string
  contractAddress: string
  tokenId?: string
}

// The optimistic outcome of a manage action, applied to the caches BEFORE the eventually-consistent
// server feed catches up:
//   listed  → the token is now on sale at `priceCredits` (fresh list, or the new price after edit)
//   removed → the token is no longer for sale
export type ManagePatch =
  | { kind: 'listed'; priceCredits: number; tradeId?: string }
  | { kind: 'removed' }

// A page of the offset-paginated My Assets grid (mirrors useInfiniteGrid's Page<T>).
type MyAssetsPage = { items: MyAsset[]; total: number }
// The shop feed's per-token secondary sale map (see fetchSecondarySaleState), keyed `${contract}-${tokenId}`.
type SecondarySaleMap = Record<string, { priceCredits: number; tradeId: string }>

// Apply a manage patch to a single owned-asset row (the MyAsset shape shared by the grid + owned-token
// detail query). The /v1/nfts `order` fields (isOnSale/listingPrice/tradeId) are what the UI reads, so
// patch all three so the card price + the "not for sale" client filter both reflect the change at once.
function applyToAsset(asset: MyAsset, patch: ManagePatch): MyAsset {
  if (patch.kind === 'removed') {
    return { ...asset, isOnSale: false, listingPrice: undefined, tradeId: undefined }
  }
  return {
    ...asset,
    isOnSale: true,
    listingPrice: patch.priceCredits,
    tradeId: patch.tradeId ?? asset.tradeId
  }
}

/**
 * Optimistically patch every react-query cache that renders a token's sale state, so a list / edit-price
 * / remove is reflected the instant the on-chain action confirms — WITHOUT waiting for the shop feed's
 * eventually-consistent materialized view (which lags a moment, so an invalidate→refetch right after the
 * mutation returns STALE data). Invalidation still runs alongside for authoritative reconciliation; this
 * is purely what the user sees immediately. Symmetric across all three actions (see ManagePatch).
 *
 * Patches, by prefix so every filter/section/pagination variant is covered:
 *   (a) ['owned-token', contract, tokenId, …]      — the PDP's owned-token query (kills the re-entry flash)
 *   (b) ['my-assets', address, …]                  — the My Assets grid (the main previously-missing piece)
 *   (c) ['secondary-sale-state', …]                — the shop-feed price map the owned card reads first
 *
 * Any in-flight refetch of these keys is cancelled first: an invalidate fired by the same handler would
 * otherwise resolve a moment later with stale feed data and clobber the optimistic write. The queries stay
 * marked stale, so they reconcile authoritatively on the next mount / window focus.
 */
export function patchManageCaches(qc: QueryClient, target: ManageTarget, patch: ManagePatch): void {
  const { address, contractAddress, tokenId } = target
  if (!contractAddress || !tokenId) return
  const key = `${contractAddress}-${tokenId}`

  // Abort refetches that a sibling invalidate may have just started, so they can't overwrite the writes below.
  void qc.cancelQueries({ queryKey: ['owned-token', contractAddress, tokenId] })
  void qc.cancelQueries({ queryKey: ['secondary-sale-state'] })
  if (address) void qc.cancelQueries({ queryKey: ['my-assets', address] })

  // (a) The PDP's single-token ownership query (['owned-token', contract, tokenId, address]) — matched by
  // prefix so it hits regardless of the trailing address segment.
  qc.setQueriesData<MyAsset | null>({ queryKey: ['owned-token', contractAddress, tokenId] }, prev =>
    prev ? applyToAsset(prev, patch) : prev
  )

  // (b) The My Assets grid (['my-assets', address, section, status, …]) — an infinite query, so walk every
  // page and patch the matching token in place. Prefix-matched so all section/filter/sort variants update.
  const myAssetsKey = address ? ['my-assets', address] : ['my-assets']
  qc.setQueriesData<InfiniteData<MyAssetsPage>>({ queryKey: myAssetsKey }, prev => {
    if (!prev?.pages) return prev
    return {
      ...prev,
      pages: prev.pages.map(page => ({
        ...page,
        items: page.items.map(a =>
          a.contractAddress === contractAddress && a.tokenId === tokenId ? applyToAsset(a, patch) : a
        )
      }))
    }
  })

  // (c) The shop-feed secondary sale map the owned card reads its authoritative credit price from — the
  // /v1/nfts `order` above never carries an off-chain shop listing, so this map is the primary source.
  qc.setQueriesData<SecondarySaleMap>({ queryKey: ['secondary-sale-state'] }, prev => {
    if (!prev) return prev
    const next = { ...prev }
    if (patch.kind === 'removed') {
      delete next[key]
    } else {
      next[key] = { priceCredits: patch.priceCredits, tradeId: patch.tradeId ?? next[key]?.tradeId ?? '' }
    }
    return next
  })
}
