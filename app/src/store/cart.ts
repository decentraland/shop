import { create } from 'zustand'
import type { CatalogItem } from '~/lib/api'

type CartState = {
  items: CatalogItem[]
  /** Whether the cart popover is showing (auto-opens on add for feedback). */
  open: boolean
  add: (item: CatalogItem) => void
  remove: (id: string) => void
  clear: () => void
  setOpen: (open: boolean) => void
}

export const useCart = create<CartState>(set => ({
  items: [],
  open: false,
  // Adding always opens the popover (feedback), even if the item was already in the cart.
  add: item =>
    set(s => (s.items.some(i => i.id === item.id) ? { open: true } : { items: [...s.items, item], open: true })),
  remove: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
  clear: () => set({ items: [] }),
  setOpen: open => set({ open })
}))
