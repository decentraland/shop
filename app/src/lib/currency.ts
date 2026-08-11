// Single source of truth for the shop's spending currency.
//
// The final NAME, SYMBOL and ICON are still WIP — we call it "credits" for now, but it may be
// renamed/re-symboled. Everything user-facing routes through here, so the eventual rebrand is a
// one-file change: update these values (and swap the icon SVG referenced by `iconName`) and it
// propagates across the whole app.
//
// The naming above is the DISPLAY layer. Internal identifiers (the `/credits` route, the
// `creditsServerUrl` config, the `usd-balance` query key, CreditsManager/useCredits on-chain terms)
// are NOT currency branding and intentionally stay as-is.
//
// This module also owns the PEG (`USD_CENTS_PER_CREDIT` and the conversions below) — the economics, not
// the branding. Same reasoning: one place to change, and the rounding rules stated once.
import type { IconName } from '~/components/Icon'
import { useLocale } from '~/store/locale'

export const CURRENCY = {
  name: 'credits', // plural, lowercase — capitalize at the call site if it starts a sentence
  nameSingular: 'credit',
  iconName: 'credits' as IconName
} as const

/**
 * THE PEG. One credit is a fixed 10 US cents, and this is the only place that number lives.
 *
 * It was previously spelled inline as `/ 10` or `* 0.1` at fifteen call sites across eight files, which
 * meant three semantically different conversions all looked like the same anonymous division — and a
 * change to the peg would have to be hunted down by hand. Convert through the helpers below instead of
 * dividing; each one carries its rounding rule, which is the part that is easy to get wrong.
 */
export const USD_CENTS_PER_CREDIT = 10

/** Credits → US dollars. Exact: a credit is a whole number of cents, so nothing is lost. */
export function creditsToUsd(credits: number): number {
  return (credits * USD_CENTS_PER_CREDIT) / 100
}

/**
 * US cents → credits, rounded **UP**. For anything the buyer has to COVER — a price, a charge, a top-up
 * — so we never quote a credit count that falls short of the amount owed.
 */
export function usdCentsToCredits(cents: number): number {
  return Math.ceil(cents / USD_CENTS_PER_CREDIT)
}

/**
 * US cents → credits, rounded **DOWN**. For anything the user HOLDS — a balance, a payout — so we never
 * show a credit they cannot actually spend. 107 cents is 10 credits and 7 cents of change that stays in
 * the balance; showing 11 would promise a credit that isn't there.
 */
export function usdCentsToCreditsFloor(cents: number): number {
  return Math.floor(cents / USD_CENTS_PER_CREDIT)
}

// "270 credits" / "1 credit" — pluralizes on the amount.
export function formatAmount(n: number): string {
  return `${n} ${creditsUnit(n)}`
}

// Just the unit word for an amount, for call sites that render the number separately (e.g. abbreviated
// via <Price>) but still need the wording to agree with it.
export function creditsUnit(n: number): string {
  return n === 1 ? CURRENCY.nameSingular : CURRENCY.name
}

// Prices follow the user's chosen locale, so grouping matches the rest of the UI (en → "1,000,000",
// es → "1.000.000"). Read from the store rather than a hook: these are pure functions called from
// plain render expressions, not only from components. Formatters are cached per locale because
// constructing an Intl.NumberFormat is comparatively expensive and a grid builds hundreds of prices.
const compactCache = new Map<string, Intl.NumberFormat>()
const fullCache = new Map<string, Intl.NumberFormat>()

function formatterFor(cache: Map<string, Intl.NumberFormat>, locale: string, opts: Intl.NumberFormatOptions) {
  let f = cache.get(locale)
  if (!f) {
    f = Intl.NumberFormat(locale, opts)
    cache.set(locale, f)
  }
  return f
}

// Defensive: a price must never be the thing that breaks a render, and tests routinely mock the
// locale store with a partial stub that has no getState.
function activeLocale(): string {
  try {
    return useLocale.getState?.().locale ?? 'en'
  } catch {
    return 'en'
  }
}

/**
 * Compact price for tight spaces like the asset card: 500 → "500", 12_000 → "12K", 5_500_000 → "5.5M".
 * Mirrors the marketplace's formatWeiToAssetCard so credit prices read the same as MANA prices there.
 * Lossy — always pair it with a `title` carrying `formatCreditsFull`.
 */
export function formatCredits(n: number, locale: string = activeLocale()): string {
  return formatterFor(compactCache, locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)
}

/** Full grouped number for tooltips / exact contexts: 5_500_000 → "5,500,000" (en) / "5.500.000" (es). */
export function formatCreditsFull(n: number, locale: string = activeLocale()): string {
  return formatterFor(fullCache, locale, {}).format(n)
}
