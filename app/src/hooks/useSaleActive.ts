import { useEffect, useState } from 'react'
import { isSaleActive, saleTimeLeft, type SaleInfo } from '~/lib/sale'

// Live sale-active flag. `isSaleActive` is otherwise evaluated once at render, so a card or detail
// view mounted while a flash sale is still open keeps advertising the "SALE -X%" badge, the
// struck-through compare-at price, and the discounted price even after `saleEndsAt` passes — when the
// listing is genuinely un-buyable (the window is the trade's on-chain expiration).
//
// The value is derived fresh from `sale` on every render (so a carousel swap to a different item is
// never stale); the effect only schedules a single repaint at the sale's end so the badge/price
// collapse back to normal the moment the window closes, without a user interaction.
export function useSaleActive(sale: SaleInfo): boolean {
  const [, repaint] = useState(0)

  useEffect(() => {
    const left = saleTimeLeft(sale.saleEndsAt)
    // Open-ended (Infinity), already-ended (<=0), or beyond setTimeout's 32-bit range → nothing to arm.
    if (!isFinite(left) || left <= 0 || left > 2_147_483_647) return
    // +1ms so `now` is strictly past `saleEndsAt` when the repaint recomputes (isSaleActive closes at <=).
    const timer = setTimeout(() => repaint(n => n + 1), left + 1)
    return () => clearTimeout(timer)
  }, [sale.saleEndsAt])

  return isSaleActive(sale)
}
