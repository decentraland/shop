import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { countSales, fetchSalesSummary, fetchSellerSales, weiOf } from '~/lib/sales'
import { collectorsOf, daysSinceLastSale, deltaOf, deltaOfWei, topBuyers } from '~/lib/storeMetrics'
import { fetchFavoriteStats } from '~/lib/favorites'
import { fetchPublishableItems } from '~/lib/builder'
import { fetchPublicCatalogue, withMissingCollections } from '~/lib/storeCatalogue'
import { captureError } from '~/lib/monitoring'
import { fetchCollectionSaleState, type CollectionSaleState } from '~/lib/collections'
import { buildStoreStats, type StoreStats } from '~/lib/storeStats'
import { toSaleableCollections } from '~/lib/saleableCollections'
import type { Session } from '~/lib/auth'

/** Stable empty map, so a render before the saves land does not hand consumers a new object. */
const EMPTY_SAVES = new Map<string, number>()

export type StorePeriod = '7d' | '30d' | 'all'
export type { StoreItem, StoreCollection, StoreStats } from '~/lib/storeStats'

const DAY_MS = 86_400_000
const PUBLIC_CATALOGUE_TIMEOUT_MS = 6_000
const WINDOW: Record<StorePeriod, number | null> = { '7d': 7, '30d': 30, all: null }

/**
 * The reads the store dashboard runs, composed into one figure set.
 *
 * The server's summary answers the window exactly, whatever the size of the store. Beside it, the sales
 * feed covers the window once for the table and the trends, the builder feed knows every item's supply
 * including the ones that never sold, and the per-collection sale state knows what is listed and at what
 * price. `buildStoreStats` turns them into the page's numbers, preferring the summary wherever it answers.
 *
 * The feed and the per-kind count are also what the page falls back to when the summary read fails, which
 * is why they run unconditionally rather than behind it: a degraded page that reports the most recent
 * sales is worth more than one that reports nothing.
 */
export function useStoreStats(session: Session | null, period: StorePeriod) {
  const address = session?.address
  const days = WINDOW[period]
  // Pinned to the day so the key does not change on every render and refetch the window each time.
  const now = useMemo(() => Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS - 1, [])
  const from = days ? now - days * DAY_MS : undefined

  const sales = useQuery({
    queryKey: ['store-sales', address, period],
    enabled: !!address,
    queryFn: () => fetchSellerSales({ seller: address, from })
  })

  /**
   * The server's aggregate for the window: totals, earnings, per-collection and per-item figures, and the
   * royalties that no client-side grouping can reach. Every number in it is exact whatever the size of the
   * store; the reads below stay as the fallback for a server that has not shipped it yet.
   */
  const summary = useQuery({
    queryKey: ['store-summary', address, period],
    enabled: !!address,
    queryFn: () => fetchSalesSummary({ seller: address as string, from })
  })

  /**
   * The same window, one window earlier, so every figure can say which way it is going.
   *
   * A number on its own is not a reading: "15 sold" is a good month or a bad one depending only on what
   * the month before it did, and the creator is the one person who cannot look that up. Skipped for all
   * time, which has nothing before it to compare against.
   */
  const previousFrom = days != null ? now - 2 * days * DAY_MS : undefined
  const previousTo = days != null ? now - days * DAY_MS : undefined
  const previous = useQuery({
    queryKey: ['store-summary-previous', address, period],
    enabled: !!address && previousFrom !== undefined,
    queryFn: () => fetchSalesSummary({ seller: address as string, from: previousFrom, to: previousTo })
  })

  // Exact, and one request: the feed counts by kind server-side, so the split never depends on how many
  // rows the cap above let through.
  const mints = useQuery({
    queryKey: ['store-mints', address, period],
    enabled: !!address,
    queryFn: () => countSales({ seller: address, from, type: 'mint' })
  })

  const builderCatalogue = useQuery({
    queryKey: ['store-catalogue', address],
    enabled: !!address && !!session,
    queryFn: () => fetchPublishableItems(address as string, session!.identity, { includeSoldOut: true })
  })

  // Fail-soft and bounded: the builder's catalogue is enough to run the page, this only fills the collections
  // it missed, so a slow feed must not hold the page past a few seconds.
  const publicCatalogue = useQuery({
    queryKey: ['store-public-catalogue', address],
    enabled: !!address && !!session,
    queryFn: () =>
      Promise.race([
        fetchPublicCatalogue(address as string),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('public catalogue timed out')), PUBLIC_CATALOGUE_TIMEOUT_MS)
        )
      ]).catch((error: unknown) => {
        captureError(error, { flow: 'my_store', step: 'public_catalogue' })
        return []
      })
  })

  const catalogue = useMemo(() => {
    if (!builderCatalogue.data) return { data: undefined }
    if (publicCatalogue.isPending) return { data: undefined }
    return { data: withMissingCollections(builderCatalogue.data, publicCatalogue.data ?? []) }
  }, [builderCatalogue.data, publicCatalogue.isPending, publicCatalogue.data])

  const addresses = useMemo(
    () => [...new Set((catalogue.data ?? []).map(item => item.contractAddress))],
    [catalogue.data]
  )

  /**
   * Per collection, settled separately.
   *
   * One collection failing must not decide the others: a single rejection would leave the whole map empty,
   * and an empty map does not read as missing — every item in every collection would be reported as never
   * listed, which is a confident wrong answer rather than a gap. The ones that failed are named instead.
   */
  const saleState = useQuery({
    queryKey: ['store-sale-state', address, addresses],
    enabled: addresses.length > 0,
    queryFn: async () => {
      const settled = await Promise.allSettled(addresses.map(ca => fetchCollectionSaleState(ca)))
      const states: Record<string, CollectionSaleState> = {}
      const unreadable = new Set<string>()
      settled.forEach((result, i) => {
        const ca = addresses[i]
        if (result.status === 'rejected') {
          unreadable.add(ca.toLowerCase())
          return
        }
        for (const [itemId, state] of Object.entries(result.value)) states[`${ca}-${itemId}`] = state
      })
      return { states, unreadable }
    }
  })

  /**
   * How many people saved each item, the one demand signal a shopper leaves without paying.
   *
   * Settled per item rather than all-or-nothing: the saves are a nice-to-have beside figures the page
   * cannot do without, so one unreachable read must not cost the creator their dashboard. The client
   * batches the ids itself, so this is a handful of requests, not one per item.
   */
  const saves = useQuery({
    queryKey: ['store-saves', addresses, (catalogue.data ?? []).length],
    enabled: (catalogue.data ?? []).length > 0,
    queryFn: async () => {
      const keys = (catalogue.data ?? []).map(item => `${item.contractAddress.toLowerCase()}-${item.blockchainItemId}`)
      const settled = await Promise.allSettled(
        keys.map(async key => [key, (await fetchFavoriteStats(key)).count] as const)
      )
      const counts = new Map<string, number>()
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') counts.set(outcome.value[0], outcome.value[1])
      }
      return counts
    }
  })

  const stats = useMemo<StoreStats | null>(() => {
    if (!catalogue.data) return null
    return buildStoreStats({
      rows: sales.data?.rows ?? [],
      total: sales.data?.total ?? 0,
      truncated: !!sales.data?.truncated,
      mints: mints.data ?? 0,
      summary: summary.data ?? null,
      catalogue: catalogue.data,
      saleState: saleState.data?.states ?? {},
      unreadable: saleState.data?.unreadable,
      days,
      now
    })
  }, [catalogue.data, sales.data, mints.data, summary.data, saleState.data, days, now])

  /**
   * The same collections a discount can run on, from the reads the page already made.
   *
   * Shared with My Creations through `toSaleableCollections` rather than derived twice: which collections
   * a creator may discount is one rule, and two copies of it would drift. Only the builder's collections:
   * one it did not return has none of the builder state a discount needs.
   */
  const saleable = useMemo(
    () => toSaleableCollections(builderCatalogue.data ?? [], saleState.data?.states),
    [builderCatalogue.data, saleState.data]
  )

  /**
   * What the window's figures did against the window before, and what the rows say about who is buying.
   *
   * Null where the question cannot be asked: all time has no earlier window, and none of it means anything
   * before the first read lands.
   */
  const trend = useMemo(() => {
    const collectors = collectorsOf(sales.data?.rows ?? [])
    // Everyone, not a top five: the table pages through them, and a store with hundreds of customers is
    // exactly the one whose owner wants to scroll past the first screen.
    const buyers = topBuyers(sales.data?.rows ?? [])
    const quietDays = daysSinceLastSale(sales.data?.rows ?? [], now)
    const against = previous.data
    return {
      collectors,
      buyers,
      quietDays,
      sold: against && summary.data ? deltaOf(summary.data.total, against.total) : null,
      earnings: against && summary.data ? deltaOfWei(weiOf(summary.data.earnedWei), weiOf(against.earnedWei)) : null,
      royalties: against && summary.data ? deltaOf(summary.data.royalties.resales, against.royalties.resales) : null
    }
  }, [sales.data, summary.data, previous.data, now])

  /** How many people saved each item, by `<contract>-<itemId>`. Empty until the reads land. */
  const savesByKey = saves.data ?? EMPTY_SAVES

  return {
    stats,
    trend,
    savesByKey,
    saleable,
    // The summary counts, because the tiles read from it the moment it lands: leaving it out let the page
    // declare itself ready on the row-derived fallback and then rewrite every headline figure under the
    // creator a beat later. Its ERROR deliberately does not count — a summary that cannot be read leaves a
    // page that still works off the rows, and calling that a failure would replace a good page with a
    // notice.
    isLoading: builderCatalogue.isLoading || publicCatalogue.isLoading || sales.isLoading || summary.isLoading,
    error: builderCatalogue.error ?? sales.error ?? null
  }
}
