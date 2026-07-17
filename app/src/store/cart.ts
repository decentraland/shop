import { create } from 'zustand'
import type { CatalogItem } from '~/lib/api'
import { track, creditsToUsd } from '~/lib/analytics'

// Where an add-to-cart happened (funnel attribution — see design/SHOP_TRACKING_SPEC.md §5.3).
export type AddToCartSource = 'grid' | 'item_detail' | 'carousel' | 'upsell' | 'collection' | 'creator'

type CartState = {
  items: CatalogItem[]
  /** Whether the cart popover is showing (auto-opens on add for feedback). */
  open: boolean
  /** How many items were added in the burst that opened the drawer — drives the "N Item(s) added"
   *  success banner. 0 when the drawer was opened from the cart icon (no banner). */
  justAddedCount: number
  /** Whether the fitting-room (try-on) modal is showing. */
  fittingOpen: boolean
  add: (item: CatalogItem, source?: AddToCartSource) => void
  remove: (id: string) => void
  clear: () => void
  /** Restore a cart snapshot (used to resume checkout after a Stripe top-up redirect wiped the store). */
  restore: (items: CatalogItem[]) => void
  setOpen: (open: boolean) => void
  setFittingOpen: (open: boolean) => void
}

const cartValueUsd = (items: CatalogItem[]): number => creditsToUsd(items.reduce((n, i) => n + i.priceCredits, 0))

export const useCart = create<CartState>((set, get) => ({
  items: [],
  open: false,
  justAddedCount: 0,
  fittingOpen: false,
  // Adding always opens the popover (feedback), even if the item was already in the cart. A real add
  // (not a re-add of an existing item) bumps justAddedCount so the success banner shows; consecutive
  // adds while the drawer is already open accumulate the count.
  add: (item, source = 'grid') => {
    const already = get().items.some(i => i.id === item.id)
    set(s =>
      already
        ? { open: true }
        : { items: [...s.items, item], open: true, justAddedCount: (s.open ? s.justAddedCount : 0) + 1 }
    )
    if (already) return
    const items = get().items
    track('Shop Added To Cart', {
      item_id: item.itemId ?? null,
      contract_address: item.contractAddress,
      price_credits: item.priceCredits,
      price_usd: creditsToUsd(item.priceCredits),
      is_primary: !item.tokenId,
      source,
      cart_size: items.length,
      cart_value_usd: cartValueUsd(items)
    })
  },
  remove: id => {
    const item = get().items.find(i => i.id === id)
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
    if (item) track('Shop Removed From Cart', { item_id: item.itemId ?? null, cart_size: get().items.length })
  },
  clear: () => set({ items: [] }),
  // Silent restore (no analytics, no popover) — the buyer already added these before topping up.
  restore: items => set(s => (s.items.length ? {} : { items })),
  // Opening/closing via setOpen (cart-icon click or dismiss) clears the "just added" banner — that
  // banner only belongs to an add-triggered open.
  setOpen: open => set({ open, justAddedCount: 0 }),
  // Opening the fitting room closes the transient popover so they don't stack.
  setFittingOpen: fittingOpen => set(fittingOpen ? { fittingOpen, open: false } : { fittingOpen })
}))
