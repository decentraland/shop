// Flash-sale helpers — pure, so they're trivially testable and safe to call in a render loop.
//
// A flash sale is a time-boxed, discounted listing: the catalog carries the current `priceCredits`
// plus, when the item is on sale, a `compareAtCredits` (the pre-sale price to strike through) and a
// `saleEndsAt` (epoch MILLISECONDS — the mapper converts the trade's expiration seconds to ms once,
// so everything downstream compares against Date.now() without re-scaling).

export type SaleInfo = {
  priceCredits: number
  compareAtCredits?: number
  saleEndsAt?: number // epoch ms
}

// On sale = there's a real discount (compare-at strictly above the current price) AND, if a window is
// set, it hasn't closed yet. A missing saleEndsAt means "no hard end" (still a valid sale) — but a
// discount that's already expired must not render as live, so an explicit past end kills it.
export function isSaleActive(sale: SaleInfo, now: number = Date.now()): boolean {
  const { priceCredits, compareAtCredits, saleEndsAt } = sale
  if (compareAtCredits == null || !(compareAtCredits > priceCredits)) return false
  if (saleEndsAt != null && saleEndsAt <= now) return false
  return true
}

// Whole-percent discount for the "SALE -X%" badge. Clamped to 1..99 so we never render "-0%" (a
// rounding artifact of a sub-1% cut) or a nonsensical "-100%". Returns 0 when there's no valid sale.
export function saleDiscountPct(compareAtCredits: number, priceCredits: number): number {
  if (!(compareAtCredits > 0) || !(priceCredits >= 0) || priceCredits >= compareAtCredits) return 0
  const pct = Math.round((1 - priceCredits / compareAtCredits) * 100)
  return Math.min(99, Math.max(1, pct))
}

// Milliseconds left until the sale ends, floored at 0. Infinity for an open-ended sale (no window).
export function saleTimeLeft(saleEndsAt: number | undefined, now: number = Date.now()): number {
  if (saleEndsAt == null) return Infinity
  return Math.max(0, saleEndsAt - now)
}

// Compact, urgency-forward countdown: "2d 4h" → "4h 12m" → "12m 30s" → "45s". Seconds only surface
// under an hour, where they actually create pressure. Returns '' at/after zero so callers hide it.
export function formatCountdown(msLeft: number): string {
  if (!isFinite(msLeft) || msLeft <= 0) return ''
  const totalSec = Math.floor(msLeft / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// How often a countdown needs to repaint to stay accurate without burning renders: every second in
// the final hour (where seconds show), every minute otherwise. Used by <SaleCountdown>.
export function countdownTickMs(msLeft: number): number {
  if (!isFinite(msLeft) || msLeft <= 0) return 0
  return msLeft < 3600_000 ? 1000 : 60_000
}
