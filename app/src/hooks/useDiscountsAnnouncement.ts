import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useIsCreator } from '~/hooks/useIsCreator'
import { fetchPublishableItems } from '~/lib/builder'
import { fetchCollectionSaleState, type CollectionSaleState } from '~/lib/collections'
import { fetchSalesSummary } from '~/lib/sales'
import { toSaleableCollections, type SaleableCollection } from '~/lib/saleableCollections'
import { ANNOUNCEMENT_SALES_DAYS, pickAnnouncementCollection } from '~/lib/discountsAnnouncement'
import { DISCOUNTS_ANNOUNCEMENT_PROMPT, dismissPrompt, isPromptDismissed } from '~/lib/dismissed-prompts'

const DAY_MS = 86_400_000

const BROWSE_PAGES = new Set(['/overview', '/items', '/event', '/market', '/my-store', '/my-favorites'])
const BROWSE_PREFIXES = ['/item/', '/collection/', '/items/creator/']

/**
 * Where the announcement may open: pages a creator is browsing, never one mid-purchase, signing or setting
 * something up, where an overlay interrupts and a stray Escape would retire it for good. My Items is left
 * out too: it opens a prompt of its own on arrival.
 */
export function isAnnouncementPage(pathname: string): boolean {
  return BROWSE_PAGES.has(pathname) || BROWSE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

/**
 * The collection to announce discounts with, once per account, and the way to retire the announcement.
 *
 * Nothing is fetched until the account could be shown it: the flag is on, the account has published a
 * collection, and it has not seen the announcement yet. Only then are its catalogue, what is listed, and
 * the recent sales read, which costs a creator a handful of requests once and everyone else none.
 */
export function useDiscountsAnnouncement(pathname: string): {
  collection: SaleableCollection | null
  dismiss: () => void
  hide: () => void
} {
  const session = useWallet(s => s.session)
  const address = session?.address
  const enabled = useCreatorSalesEnabled()
  const isCreator = useIsCreator(enabled ? address : undefined)
  // Read for the current account on every render, so a switch of account never carries the last one's answer.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const dismissed = (!!address && dismissedFor === address) || isPromptDismissed(DISCOUNTS_ANNOUNCEMENT_PROMPT, address)
  // Put away for this visit only: the call to action hands over to the store, which retires it for good once
  // the flow it promised has actually opened.
  const [hidden, setHidden] = useState(false)
  const [now] = useState(() => Date.now())

  const eligible = !!session && enabled && isCreator && !dismissed

  const catalogue = useQuery({
    queryKey: ['announcement-catalogue', address],
    enabled: eligible,
    staleTime: Infinity,
    queryFn: () => fetchPublishableItems(address as string, session!.identity)
  })

  const addresses = useMemo(
    () => [...new Set((catalogue.data ?? []).map(item => item.contractAddress))],
    [catalogue.data]
  )

  // A collection whose state cannot be read is simply not offered: this picks an example, it reports nothing.
  const saleState = useQuery({
    queryKey: ['announcement-sale-state', address, addresses],
    enabled: eligible && addresses.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const settled = await Promise.allSettled(addresses.map(ca => fetchCollectionSaleState(ca)))
      const states: Record<string, CollectionSaleState> = {}
      settled.forEach((result, i) => {
        if (result.status !== 'fulfilled') return
        for (const [itemId, state] of Object.entries(result.value)) states[`${addresses[i]}-${itemId}`] = state
      })
      return states
    }
  })

  // Without recent sales the pick still works, on listed items alone, so a failed read is not worth waiting on.
  const recentSales = useQuery({
    queryKey: ['announcement-recent-sales', address, now],
    enabled: eligible,
    staleTime: Infinity,
    queryFn: () =>
      fetchSalesSummary({ seller: address as string, from: now - ANNOUNCEMENT_SALES_DAYS * DAY_MS, to: now })
        .then(summary => new Map(summary.byCollection.map(c => [c.contractAddress.toLowerCase(), c.sold])))
        .catch(() => new Map<string, number>())
  })

  const collection = useMemo(() => {
    if (!eligible || hidden || !isAnnouncementPage(pathname) || !saleState.data || !recentSales.data) return null
    return pickAnnouncementCollection(toSaleableCollections(catalogue.data ?? [], saleState.data), recentSales.data)
  }, [eligible, hidden, pathname, catalogue.data, saleState.data, recentSales.data])

  const dismiss = useCallback(() => {
    dismissPrompt(DISCOUNTS_ANNOUNCEMENT_PROMPT, address)
    setDismissedFor(address ?? null)
  }, [address])
  const hide = useCallback(() => setHidden(true), [])

  return { collection, dismiss, hide }
}
