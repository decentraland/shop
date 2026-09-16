import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { countSales, fetchSalesSummary, fetchSellerSales } from '~/lib/sales'
import { fetchPublishableItems } from '~/lib/builder'
import { fetchPublicCatalogue } from '~/lib/storePreview'
import { fetchCollectionSaleState, type CollectionSaleState } from '~/lib/collections'
import { buildStoreStats, type StoreStats } from '~/lib/storeStats'
import { toSaleableCollections } from '~/lib/saleableCollections'
import type { Session } from '~/lib/auth'

export type StorePeriod = '7d' | '30d' | 'all'
export type { StoreItem, StoreCollection, StoreStats } from '~/lib/storeStats'

const DAY_MS = 86_400_000
const WINDOW: Record<StorePeriod, number | null> = { '7d': 7, '30d': 30, all: null }

/**
 * The three fetches the store dashboard runs, composed into one figure set.
 *
 * The sales feed covers the window once; the builder feed knows every item's supply, including the ones
 * that never sold; the per-collection sale state knows what is listed and at what price. `buildStoreStats`
 * turns the three into the page's numbers.
 */
export function useStoreStats(session: Session | null, period: StorePeriod, viewAs?: string | null) {
  const address = viewAs ?? session?.address
  const days = WINDOW[period]
  // Pinned to the day so the key does not change on every render and refetch the window each time.
  const now = useMemo(() => Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS - 1, [])
  const from = days ? now - days * DAY_MS : undefined

  const sales = useQuery({
    queryKey: ['store-sales', address, period],
    enabled: !!address,
    queryFn: () => fetchSellerSales({ seller: address, from })
  })

  // Someone else's store can only be read from the public feeds: the builder answers for the signed-in
  // creator alone.
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

  // Exact, and one request: the feed counts by kind server-side, so the split never depends on how many
  // rows the cap above let through.
  const mints = useQuery({
    queryKey: ['store-mints', address, period],
    enabled: !!address,
    queryFn: () => countSales({ seller: address, from, type: 'mint' })
  })

  const catalogue = useQuery({
    queryKey: ['store-catalogue', address, !!viewAs],
    enabled: !!address && (!!viewAs || !!session),
    queryFn: () =>
      viewAs
        ? fetchPublicCatalogue(viewAs)
        : fetchPublishableItems(address as string, session!.identity, { includeSoldOut: true })
  })

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
   * a creator may discount is one rule, and two copies of it would drift.
   */
  const saleable = useMemo(
    () => toSaleableCollections(catalogue.data ?? [], saleState.data?.states),
    [catalogue.data, saleState.data]
  )

  return {
    stats,
    saleable,
    isLoading: catalogue.isLoading || sales.isLoading,
    error: catalogue.error ?? sales.error ?? null
  }
}
