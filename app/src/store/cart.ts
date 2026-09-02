import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CatalogItem } from '~/lib/api'
import { track, creditsToUsd } from '~/lib/analytics'

// Where an add-to-cart happened (funnel attribution — see design/SHOP_TRACKING_SPEC.md §5.3).
//
// The home page's rails get their own values rather than folding into 'grid'. AssetCard used to hardcode
// 'grid' wherever it was rendered, so an add from Trending was indistinguishable from one off the browse
// grid and the rails' contribution read as zero. 'carousel' is NOT one of them — it belongs to the avatar
// showcase's bulk add.
export type AddToCartSource = 'grid' | 'item_detail' | 'carousel' | 'upsell' | 'outfit' | 'trending' | 'new_creations'

/**
 * Where the line came from, stamped when it enters the cart and carried through to the purchase event.
 *
 * It lives ON the line rather than only in the add-to-cart event because that is the only way the
 * purchase can name it: `Shop Added To Cart` knew the source and `Shop Completed Purchase` did not, so
 * an outfit that was actually bought was indistinguishable from three unrelated wearables and outfit
 * sales read as zero. Persisted with the cart, so it survives a reload or the return from a Stripe
 * top-up.
 *
 * FIRST TOUCH WINS: a quantity bump on a line already in the cart keeps the original source.
 */
export type CartProvenance = { source?: AddToCartSource; outfitId?: string }

// A cart line: a catalog item plus how many units of it the buyer wants. Quantity is meaningful ONLY
// for PRIMARY (mint) lines — a buyer can mint N copies up to the remaining supply (`available`). A
// SECONDARY line is a single unique token (tokenId), so it stays locked at quantity 1.
export type CartItem = CatalogItem & CartProvenance & { quantity: number }

// Primary (mint) lines carry an itemId and no tokenId; secondary lines carry a specific tokenId.
const isPrimaryLine = (item: { tokenId?: string }): boolean => !item.tokenId

// The most units a line may hold: the remaining mintable supply for a primary line (when known),
// else unbounded. Secondary lines are always capped at 1 by the primary guard at the call sites.
const stockCap = (item: { available?: number }): number =>
  typeof item.available === 'number' ? item.available : Infinity

type CartState = {
  items: CartItem[]
  /** Lowercased address of the buyer this cart belongs to, or null while nobody has claimed it. */
  owner: string | null
  /** Whether the cart popover is showing (auto-opens on add for feedback). */
  open: boolean
  /** How many items were added in the burst that opened the drawer — drives the "N Item(s) added"
   *  success banner. 0 when the drawer was opened from the cart icon (no banner). */
  justAddedCount: number
  /** Whether the fitting-room (try-on) modal is showing. */
  fittingOpen: boolean
  /** `outfitId` is set only when source is 'outfit' — it is what makes an outfit sale countable. */
  add: (item: CatalogItem, source?: AddToCartSource, outfitId?: string) => void
  remove: (id: string) => void
  /** Set an exact quantity for a PRIMARY line (clamped to 1..stock). No-op for secondary lines. */
  setQuantity: (id: string, quantity: number) => void
  /** +1 unit on a PRIMARY line, capped at remaining stock. No-op for secondary lines / at the cap. */
  increment: (id: string) => void
  /** -1 unit on a PRIMARY line, floored at 1 (removal is the trash button, not the stepper). */
  decrement: (id: string) => void
  clear: () => void
  /** Point the cart at a session (address, or null when signed out) — see the action for the policy. */
  reloadFor: (address: string | null) => void
  /** Restore a cart snapshot (used to resume checkout after a Stripe top-up redirect wiped the store). */
  restore: (items: Array<CatalogItem & CartProvenance & { quantity?: number }>) => void
  setOpen: (open: boolean) => void
  setFittingOpen: (open: boolean) => void
}

// Total cart value in USD — sums each line's price × its quantity (1 credit = $0.10).
const cartValueUsd = (items: CartItem[]): number =>
  creditsToUsd(items.reduce((n, i) => n + i.priceCredits * i.quantity, 0))

// Coerce a persisted/restored line to a valid CartItem: default a missing/invalid quantity to 1
// (backward-compat with carts saved before quantity existed), and never let a secondary line exceed 1.
const withQuantity = (item: CatalogItem & CartProvenance & { quantity?: number }): CartItem => {
  const raw = Math.floor(item.quantity ?? 1)
  const quantity = isPrimaryLine(item) ? Math.max(1, Number.isFinite(raw) ? raw : 1) : 1
  return { ...item, quantity }
}

// Persisted to localStorage so the cart survives a full page reload or a return from an external
// redirect (e.g. a Stripe credits top-up). We persist only `items` + `owner` (see partialize): the transient
// UI fields — open, justAddedCount, fittingOpen — are excluded so a reload never reopens the drawer
// or re-shows the "N added" banner; they always rehydrate at their defaults. `restore()` becomes a
// near no-op now that the cart rehydrates itself, but its guard keeps it safe (left intentionally).
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      owner: null,
      open: false,
      justAddedCount: 0,
      fittingOpen: false,
      // Adding always opens the popover (feedback). A PRIMARY line already in the cart increments its
      // quantity (capped at stock); a SECONDARY line already in the cart is a no-op (a unique token —
      // only one can be bought). Every real add (new line OR a primary increment) bumps justAddedCount
      // for the success banner and tracks a funnel event; a no-op does neither.
      add: (item, source = 'grid', outfitId) => {
        const isPrimary = isPrimaryLine(item)
        const existing = get().items.find(i => i.id === item.id)

        // Secondary listing already in the cart → can't add a second unit of a unique token.
        if (existing && !isPrimary) {
          set({ open: true })
          return
        }
        // Primary already in the cart but at its remaining-stock cap → nothing more to add.
        if (existing && existing.quantity >= stockCap(existing)) {
          set({ open: true })
          return
        }

        set(s =>
          existing
            ? {
                items: s.items.map(i => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)),
                open: true,
                fittingOpen: false,
                justAddedCount: (s.open ? s.justAddedCount : 0) + 1
              }
            : {
                items: [...s.items, withQuantity({ ...item, source, outfitId })],
                open: true,
                // The drawer is the surface an add raises; belt and braces so no path can leave the fitting
                // room open over the page the buyer is actually looking at.
                fittingOpen: false,
                justAddedCount: (s.open ? s.justAddedCount : 0) + 1
              }
        )

        const items = get().items
        track('Shop Added To Cart', {
          item_id: item.itemId ?? null,
          contract_address: item.contractAddress,
          price_credits: item.priceCredits,
          price_usd: creditsToUsd(item.priceCredits),
          category: item.category,
          is_smart: item.isSmart ?? false,
          is_primary: isPrimary,
          source,
          cart_size: items.length,
          cart_value_usd: cartValueUsd(items)
        })
      },
      remove: id => {
        const item = get().items.find(i => i.id === id)
        set(s => {
          const items = s.items.filter(i => i.id !== id)
          // Emptying the cart closes the fitting room: everything it shows IS the cart, so with nothing left
          // it can only render its own empty state — and, worse, it stayed OPEN behind the scenes. Removing
          // the last line there and then going back to browse and adding something reopened the modal on top
          // of the grid, because `add` raises the cart drawer and never knew to lower this.
          // Clearing the banner with the line it announced: `justAddedCount` drives the "N Item(s) added"
          // success message, and nothing but `setOpen` used to reset it — so removing what you had just
          // added left the banner asserting the add over an empty drawer, and the NEXT add resumed from
          // that stale count instead of starting over (add 4, delete all, add 1 → "5 Items added").
          return items.length === 0 ? { items, justAddedCount: 0, fittingOpen: false } : { items, justAddedCount: 0 }
        })
        if (item) track('Shop Removed From Cart', { item_id: item.itemId ?? null, cart_size: get().items.length })
      },
      setQuantity: (id, quantity) =>
        set(s => ({
          items: s.items.map(i => {
            if (i.id !== id || !isPrimaryLine(i)) return i
            const n = Math.max(1, Math.min(Math.floor(quantity), stockCap(i)))
            return { ...i, quantity: Number.isFinite(n) ? n : 1 }
          })
        })),
      increment: id =>
        set(s => ({
          items: s.items.map(i =>
            i.id === id && isPrimaryLine(i) && i.quantity < stockCap(i) ? { ...i, quantity: i.quantity + 1 } : i
          )
        })),
      decrement: id =>
        set(s => ({
          items: s.items.map(i =>
            i.id === id && isPrimaryLine(i) && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i
          )
        })),
      clear: () => set({ items: [], justAddedCount: 0, fittingOpen: false }),
      // The cart is persisted under one global key, so without this a second account on the same device
      // rehydrates the first one's cart (the account-switch handler reloads the page rather than purging
      // stores). Three cases, and only one of them empties the cart:
      //  - nobody has claimed the cart yet → the signer adopts it, so items added while browsing signed
      //    out survive the sign-in that checkout asks for;
      //  - signing out → keep both the items and the owner tag, so the same buyer coming back finds their
      //    cart, and a DIFFERENT buyer signing in still trips the case below;
      //  - a different address → this cart is not theirs. Empty it.
      reloadFor: address => {
        const next = address ? address.toLowerCase() : null
        const owner = get().owner
        if (!next || next === owner) return
        if (!owner) {
          set({ owner: next })
          return
        }
        set({ items: [], owner: next, fittingOpen: false })
      },
      // Silent restore (no analytics, no popover) — the buyer already added these before topping up.
      // Coerce each line's quantity so an older snapshot (pre-quantity) rehydrates safely.
      restore: items => set(s => (s.items.length ? {} : { items: items.map(withQuantity) })),
      // Opening/closing via setOpen (cart-icon click or dismiss) clears the "just added" banner — that
      // banner only belongs to an add-triggered open.
      setOpen: open => set({ open, justAddedCount: 0 }),
      // Opening the fitting room closes the transient popover so they don't stack.
      setFittingOpen: fittingOpen => set(fittingOpen ? { fittingOpen, open: false } : { fittingOpen })
    }),
    {
      name: 'dcl_shop_cart',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Persist the cart contents and who they belong to; the transient UI fields must reset on every reload.
      partialize: s => ({ items: s.items, owner: s.owner }),
      // Migrate carts persisted before quantity existed (v1): default every line to quantity 1 so a
      // stored cart never rehydrates with an undefined quantity (which would break totals/steppers).
      migrate: persisted => {
        const state = persisted as { items?: Array<CatalogItem & { quantity?: number }> } | undefined
        if (!state?.items) return state
        return { items: state.items.map(withQuantity) }
      }
    }
  )
)
