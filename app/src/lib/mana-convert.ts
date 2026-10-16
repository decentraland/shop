// MANA ↔ USD conversion at a given rate. Pure BigInt arithmetic — no chain, no network, no config.
//
// Split out of lib/mana-rate on purpose. That module READS the on-chain oracle, so it imports
// `decentraland-transactions`, which cannot be resolved as an ESM directory import under vitest — any
// spec that touched a module importing it had to stub the whole package (see lib/activity.spec.ts). The
// arithmetic needs none of that, and the cart's review path needs the arithmetic, so keeping them in one
// file made the stub viral. `lib/mana-rate` re-exports everything here, so existing imports still work.
import { USD_CENTS_PER_CREDIT } from '~/lib/currency'

export type ManaRate = { rate: bigint; decimals: number }

// Derived from the peg rather than restating it: USD here is 18-decimal wei, so one cent is 1e16 and a
// credit is USD_CENTS_PER_CREDIT of those. Today that is 1e17; if the peg ever moves, this follows.
export const USD_WEI_PER_CENT = 10n ** 16n
export const USD_WEI_PER_CREDIT = BigInt(USD_CENTS_PER_CREDIT) * USD_WEI_PER_CENT

// MANA wei (18 decimals) → USD wei (1e18 = $1) at the given rate: usdWei = manaWei * rate / 10^dec.
export function manaWeiToUsdWei(manaWei: string, { rate, decimals }: ManaRate): bigint {
  return (BigInt(manaWei) * rate) / 10n ** BigInt(decimals)
}

// USD cents → MANA wei at the given rate — the inverse of manaWeiToUsdCents, rounded UP so a quoted
// MANA amount never sits BELOW the USD it has to cover. Used to price a whole cart in MANA (the
// per-trade oracle read prices ONE trade; a basket is priced from its USD total at the same rate).
export function usdCentsToManaWei(cents: number, { rate, decimals }: ManaRate): bigint {
  if (!Number.isFinite(cents) || cents <= 0 || rate <= 0n) return 0n
  const usdWei = BigInt(Math.ceil(cents)) * USD_WEI_PER_CENT
  const num = usdWei * 10n ** BigInt(decimals)
  return (num + rate - 1n) / rate // ceil
}

// MANA wei → credits (1 credit = $0.10), rounded UP so the shown price never sits BELOW what
// checkout charges at the display rate, floored at 1 credit. Returns null on a malformed manaWei so
// the UI can show "price unavailable" instead of a fake "1 credit". BigInt throughout (no float drift).
export function manaWeiToCredits(manaWei: string, rate: ManaRate): number | null {
  let usdWei: bigint
  try {
    usdWei = manaWeiToUsdWei(manaWei, rate)
  } catch {
    return null
  }
  const whole = usdWei / USD_WEI_PER_CREDIT
  const credits = usdWei % USD_WEI_PER_CREDIT > 0n ? whole + 1n : whole
  const n = Number(credits)
  return n < 1 ? 1 : n
}

/**
 * The credits to DISPLAY for a listing row, whatever feed it came from. A MANA-priced (legacy) row is
 * converted at the live rate — its credit price fluctuates and is only indicative until checkout locks
 * it; a USD-pegged row already carries fixed credits. Zero while the rate is still loading (or the
 * oracle is down), which every surface reads as "no price to show yet" rather than a made-up number.
 *
 * This is the app's one display-pricing rule: the unified browse grid applies it inline (Assets.tsx
 * `priceOf`), and every other surface that renders a possibly-MANA row goes through here.
 */
export function displayCredits(
  row: { manaWei?: string | null; priceCredits: number },
  rate: ManaRate | undefined
): number {
  if (!row.manaWei) return row.priceCredits
  if (!rate) return 0
  return manaWeiToCredits(row.manaWei, rate) ?? 0
}

/**
 * The smallest MANA list amount a rate coupon sells for `saleWei`, so a discounted MANA row's struck-through
 * price can be re-priced at the same live rate as its sale. Display only.
 */
export function listManaWeiFromSale(saleWei: string, discountPpm: number): string | null {
  if (!Number.isInteger(discountPpm) || discountPpm <= 0 || discountPpm >= 1_000_000) return null
  let sale: bigint
  try {
    sale = BigInt(saleWei)
  } catch {
    return null
  }
  if (sale <= 0n) return sale === 0n ? '0' : null
  // The contract charges list - floor(list * ppm / 1e6), so the amounts charging `sale` are
  // ((sale - 1) / (1 - p), sale / (1 - p)]: the smallest is one past the floor of the open end.
  return (((sale - 1n) * 1_000_000n) / BigInt(1_000_000 - discountPpm) + 1n).toString()
}

/**
 * A listing's MANA price with the creator's discount applied — what the marketplace will really pull.
 *
 * A trade is signed at the LIST price and the coupon lowers it at settlement, so every consumer of the raw
 * figure is wrong for an item on sale: the button quotes more MANA than the buyer pays, the rail is hidden
 * from someone whose balance covers the real price, and the mixed rail's MANA leg is scaled up by the same
 * factor. They all read this instead so there is one number.
 *
 * Rounded UP, because the figure also sizes the allowance, and an allowance a wei short of what `accept`
 * pulls reverts the purchase.
 */
export function discountedManaWei(listWei: bigint, coupon?: { discount: number }): bigint {
  if (!coupon) return listWei
  return listWei - (listWei * BigInt(coupon.discount)) / 1_000_000n
}

export type LivePriced = {
  manaWei?: string | null
  priceCredits: number
  compareAtCredits?: number | null
  coupon?: { discountType: number; discount: number } | null
}

/**
 * A row's credit price and struck-through list price, both at the live rate. USD-quoted rows pass through;
 * a MANA row under a rate coupon re-prices its compare-at from the recovered list amount, so the pair moves
 * together and the strike cannot fall below the sale.
 */
export function livePrices(
  row: LivePriced,
  rate: ManaRate | undefined
): { priceCredits: number; compareAtCredits?: number } {
  const listed = row.compareAtCredits ?? undefined
  if (!row.manaWei) return { priceCredits: row.priceCredits, compareAtCredits: listed }
  const priceCredits = displayCredits(row, rate)
  if (!rate || listed == null || !row.coupon || row.coupon.discountType !== 1) {
    return { priceCredits, compareAtCredits: listed }
  }
  const listWei = listManaWeiFromSale(row.manaWei, row.coupon.discount)
  const compareAt = listWei ? manaWeiToCredits(listWei, rate) : null
  return { priceCredits, compareAtCredits: compareAt != null && compareAt > priceCredits ? compareAt : undefined }
}

// MANA wei → USD cents, rounded UP. Used to size the credits-server authorize amount for a legacy
// purchase (the server then locks MANA at its own oracle read + signs the fixed maxCreditedValue).
export function manaWeiToUsdCents(manaWei: string, rate: ManaRate): number {
  let usdWei: bigint
  try {
    usdWei = manaWeiToUsdWei(manaWei, rate)
  } catch {
    return 0
  }
  const whole = usdWei / USD_WEI_PER_CENT
  const cents = usdWei % USD_WEI_PER_CENT > 0n ? whole + 1n : whole
  return Number(cents)
}
