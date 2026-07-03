import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CatalogItem } from '~/lib/api'

// Favorites persist across sessions (localStorage). We store the full CatalogItem so the
// My Favorites page can render + deep-link without re-fetching.
type FavState = {
  items: Record<string, CatalogItem>
  toggle: (item: CatalogItem) => void
  remove: (id: string) => void
}

export const useFavorites = create<FavState>()(
  persist(
    set => ({
      items: {},
      toggle: item =>
        set(s => {
          const items = { ...s.items }
          if (items[item.id]) delete items[item.id]
          else items[item.id] = item
          return { items }
        }),
      remove: id =>
        set(s => {
          const items = { ...s.items }
          delete items[id]
          return { items }
        })
    }),
    { name: 'shop-favorites' }
  )
)
