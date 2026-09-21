import { create } from 'zustand'
import type { ListingCoupon } from '~/lib/trade-encoding'

/**
 * Uses this browser has watched a coupon spend, before the catalogue admits them.
 *
 * The count on the page comes from the server's `coupon_state`, which a poller refreshes on an interval,
 * so for up to a minute after a purchase the catalogue still reports the figure from before it. Refetching
 * does not help and never did: the number is not stale in the cache, it is stale at its source.
 *
 * So this holds a FLOOR rather than a value. A purchase that settled is one use spent, whatever the
 * catalogue says yet, and the reader takes whichever count is higher. The server's answer wins the moment
 * it catches up, and nothing here can make the bar go backwards.
 *
 * A STORE rather than a module-level map, which is the part that has to be a subscription: the catalogue
 * answers a refetch with the same bytes, so react-query hands back the same object and nothing re-renders.
 * A component reading a plain map would never be told the floor had moved.
 *
 * In memory and per session on purpose. It bridges one refresh interval, it is not a record of anything,
 * and the worst a wrong floor can cost is one overstated use until the server answers above it.
 */
type CouponRef = Pick<ListingCoupon, 'id' | 'used'>

type CouponUsesState = {
  /** Uses spent here, by coupon id. */
  spent: Record<string, number>
  record: (coupon?: CouponRef | null, count?: number) => void
  recordMany: (coupons: (CouponRef | null | undefined)[]) => void
  reset: () => void
}

export const useCouponUses = create<CouponUsesState>(set => ({
  spent: {},
  record: (coupon, count = 1) => {
    if (!coupon?.id || count <= 0) return
    set(state => ({
      spent: {
        ...state.spent,
        // Against the higher of the two, so a second purchase in the same minute counts on top of the
        // first rather than restating it from a catalogue figure that has not moved.
        [coupon.id]: Math.max(coupon.used ?? 0, state.spent[coupon.id] ?? 0) + count
      }
    }))
  },
  recordMany: coupons => {
    const perCoupon = new Map<string, { coupon: CouponRef; count: number }>()
    for (const coupon of coupons) {
      if (!coupon?.id) continue
      const entry = perCoupon.get(coupon.id) ?? { coupon, count: 0 }
      entry.count += 1
      perCoupon.set(coupon.id, entry)
    }
    set(state => {
      const spent = { ...state.spent }
      for (const { coupon, count } of perCoupon.values()) {
        spent[coupon.id] = Math.max(coupon.used ?? 0, spent[coupon.id] ?? 0) + count
      }
      return { spent }
    })
  },
  reset: () => set({ spent: {} })
}))

/** What to show: the catalogue's count, or ours where we watched more go than it has noticed. */
export function couponUsedWith(spent: Record<string, number>, coupon?: CouponRef | null): number {
  if (!coupon?.id) return coupon?.used ?? 0
  return Math.max(coupon.used ?? 0, spent[coupon.id] ?? 0)
}

/** The same, subscribed, so a component redraws the moment a purchase settles under it. */
export function useCouponUsed(coupon?: CouponRef | null): number {
  return useCouponUses(state => couponUsedWith(state.spent, coupon))
}

/**
 * Fire-and-forget helpers for the purchase paths, which are async handlers rather than components.
 *
 * `recordCouponUses` groups first, so three copies covered by one discount count as three uses rather
 * than as three purchases each reading the same unmoved catalogue figure and adding one.
 */
export const recordCouponUse = (coupon?: CouponRef | null, count = 1) => useCouponUses.getState().record(coupon, count)
export const recordCouponUses = (coupons: (CouponRef | null | undefined)[]) =>
  useCouponUses.getState().recordMany(coupons)
