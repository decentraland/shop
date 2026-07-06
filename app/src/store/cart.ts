import { create } from 'zustand'
import type { CatalogItem } from '~/lib/api'
import { track, creditsToUsd } from '~/lib/analytics'

// Where an add-to-cart happened (funnel attribution — see design/SHOP_TRACKING_SPEC.md §5.3).
export type AddToCartSource = 'grid' | 'item_detail' | 'carousel' | 'upsell' | 'collection' | 'creator'

type CartState = {
  items: CatalogItem[]
  /** Whether the cart popover is showing (auto-opens on add for feedback). */
  open: boolean
  /** Whether the fitting-room (try-on) modal is showing. */
  fittingOpen: boolean
  add: (item: CatalogItem, source?: AddToCartSource) => void
  remove: (id: string) => void
  clear: () => void
  setOpen: (open: boolean) => void
  setFittingOpen: (open: boolean) => void
}

const cartValueUsd = (items: CatalogItem[]): number => creditsToUsd(items.reduce((n, i) => n + i.priceCredits, 0))

export const useCart = create<CartState>((set, get) => ({
  items: [],
  open: false,
  fittingOpen: false,
  // Adding always opens the popover (feedback), even if the item was already in the cart.
  add: (item, source = 'grid') => {
    const already = get().items.some(i => i.id === item.id)
    set(s => (already ? { open: true } : { items: [...s.items, item], open: true }))
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
  setOpen: open => set({ open }),
  // Opening the fitting room closes the transient popover so they don't stack.
  setFittingOpen: fittingOpen => set(fittingOpen ? { fittingOpen, open: false } : { fittingOpen })
}))
