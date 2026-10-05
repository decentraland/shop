import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useIsCreator } from '~/hooks/useIsCreator'
import { useMyStoreEnabled } from '~/hooks/useMyStoreEnabled'
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

const OTHER_DIALOG = '[role="dialog"][aria-modal="true"]:not([data-testid="discounts-announcement"])'

/** Whether another modal is open, so the announcement waits rather than stacking on it and sharing its Escape. */
function useOtherDialogOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () => setOpen(document.querySelector(OTHER_DIALOG) !== null)
    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal']
    })
    check()
    return () => observer.disconnect()
  }, [])
  return open
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
  // The call to action lands on the store: without access to it, the announcement would promise a page
  // that bounces the creator home.
  const storeOpen = useMyStoreEnabled()
  const isCreator = useIsCreator(enabled && storeOpen ? address : undefined)
  const otherDialogOpen = useOtherDialogOpen()
  // Read for the current account on every render, so a switch of account never carries the last one's answer.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const dismissed = (!!address && dismissedFor === address) || isPromptDismissed(DISCOUNTS_ANNOUNCEMENT_PROMPT, address)
  // Put away for this visit only: the call to action hands over to the store, which retires it for good once
  // the flow it promised has actually opened.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)
  const hidden = !!address && hiddenFor === address
  const [now] = useState(() => Date.now())

  // Only read on a page it may open on, so a creator who never qualifies costs nothing on checkout.
  const eligible = !!session && enabled && storeOpen && isCreator && !dismissed && isAnnouncementPage(pathname)

  // The store dashboard's own read, under its key, so the two share one request rather than make two.
  const catalogue = useQuery({
    queryKey: ['store-catalogue', address],
    enabled: eligible,
    queryFn: () => fetchPublishableItems(address as string, session!.identity, { includeSoldOut: true })
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
    if (!eligible || hidden || otherDialogOpen || !saleState.data || !recentSales.data) return null
    return pickAnnouncementCollection(toSaleableCollections(catalogue.data ?? [], saleState.data), recentSales.data)
  }, [eligible, hidden, otherDialogOpen, catalogue.data, saleState.data, recentSales.data])

  const dismiss = useCallback(() => {
    dismissPrompt(DISCOUNTS_ANNOUNCEMENT_PROMPT, address)
    setDismissedFor(address ?? null)
  }, [address])
  const hide = useCallback(() => setHiddenFor(address ?? null), [address])

  return { collection, dismiss, hide }
}
