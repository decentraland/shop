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
 * In memory and per session on purpose. It bridges one refresh interval, it is not a record of anything,
 * and the worst a wrong floor can cost is one overstated use until the server answers above it.
 */
const spentHere = new Map<string, number>()

type CouponRef = Pick<ListingCoupon, 'id' | 'used'>

/** Call once a purchase has settled, with the coupon as the page knew it at the time. */
export function recordCouponUse(coupon?: CouponRef | null, count = 1): void {
  if (!coupon?.id || count <= 0) return
  // Against the higher of the two, so a second purchase in the same minute counts on top of the first
  // rather than restating it from a catalogue figure that has not moved.
  const known = Math.max(coupon.used ?? 0, spentHere.get(coupon.id) ?? 0)
  spentHere.set(coupon.id, known + count)
}

/**
 * A whole basket at once, one entry per copy bought.
 *
 * Grouped before it is recorded, so three copies covered by the same discount count as three uses rather
 * than as three separate purchases each reading the same unmoved catalogue figure and adding one.
 */
export function recordCouponUses(coupons: (CouponRef | null | undefined)[]): void {
  const perCoupon = new Map<string, { coupon: CouponRef; count: number }>()
  for (const coupon of coupons) {
    if (!coupon?.id) continue
    const entry = perCoupon.get(coupon.id) ?? { coupon, count: 0 }
    entry.count += 1
    perCoupon.set(coupon.id, entry)
  }
  for (const { coupon, count } of perCoupon.values()) recordCouponUse(coupon, count)
}

/** What to show: the catalogue's count, or ours where we watched more go than it has noticed. */
export function couponUsed(coupon?: CouponRef | null): number {
  if (!coupon?.id) return coupon?.used ?? 0
  return Math.max(coupon.used ?? 0, spentHere.get(coupon.id) ?? 0)
}

/** Test seam: drops the floors so a spec starts from a known state. */
export function resetCouponUses(): void {
  spentHere.clear()
}
