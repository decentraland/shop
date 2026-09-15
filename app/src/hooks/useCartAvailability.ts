import { useQueries } from '@tanstack/react-query'
import type { CartItem } from '~/store/cart'
import { resolveLineAvailability, type CartLineAvailability } from '~/lib/cart-availability'
import { useSecondaryPurchases } from '~/hooks/useSecondaryPurchases'

/**
 * Validate every CURRENT cart line's live trade when the cart opens — one bounded query per line, so
 * the work never scans beyond the basket (no unbounded N+1). Each line's result is cached for 30s and
 * revalidated on window refocus, so reopening the cart is cheap.
 *
 * Lines are OPTIMISTIC: a pending or errored query reports 'available' so the cart renders and totals
 * immediately and a transient fetch error never marks a good line unavailable — the map only flips a
 * line to sold-out/unavailable once its trade has actually resolved as such.
 *
 * @param enabled gate the network work to when the cart is actually visible (drawer/page open).
 * @returns a map of cart-line id → its resolved availability (defaulting to 'available').
 */
export function useCartAvailability(items: CartItem[], enabled = true): Record<string, CartLineAvailability> {
  // In the key below, not just consulted inside the resolver: a resale's availability now depends on this
  // permission, so a cached 'available' from before a flip would keep a line looking buyable for the rest
  // of its 30s window.
  const secondaryPurchases = useSecondaryPurchases()

  const results = useQueries({
    queries: items.map(item => ({
      // Key on the identity that determines the trade to resolve: a re-priced/re-signed line (new
      // tradeId) revalidates, while an unchanged line reuses its cached result across reopens.
      queryKey: [
        'cart-availability',
        item.id,
        item.tradeId ?? null,
        item.itemId ?? null,
        item.contractAddress,
        secondaryPurchases
      ],
      queryFn: () => resolveLineAvailability(item),
      enabled,
      staleTime: 30_000,
      gcTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: true
    }))
  })

  const map: Record<string, CartLineAvailability> = {}
  items.forEach((item, i) => {
    map[item.id] = results[i]?.data ?? 'available'
  })
  return map
}
