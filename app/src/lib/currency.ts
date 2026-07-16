// Single source of truth for the shop's spending currency.
//
// The final NAME, SYMBOL and ICON are still WIP — we call it "credits" for now, but it may be
// renamed/re-symboled. Everything user-facing routes through here, so the eventual rebrand is a
// one-file change: update these values (and swap the icon SVG referenced by `iconClass`) and it
// propagates across the whole app.
//
// NOTE: this is only the DISPLAY layer. Internal identifiers (the `/credits` route, the
// `creditsServerUrl` config, the `usd-balance` query key, CreditsManager/useCredits on-chain terms)
// are NOT currency branding and intentionally stay as-is.
export const CURRENCY = {
  name: 'credits', // plural, lowercase — capitalize at the call site if it starts a sentence
  nameSingular: 'credit',
  symbol: '◈', // compact glyph for tight spaces (e.g. "◈ 500")
  iconClass: 'ico-credits' // CSS mask icon; swap this class + its SVG (index.css) to change the mark
} as const

// "270 credits" / "1 credit" — pluralizes on the amount.
export function formatAmount(n: number): string {
  return `${n} ${n === 1 ? CURRENCY.nameSingular : CURRENCY.name}`
}

// Compact price for tight spaces like the asset card: 500 → "500", 12_000 → "12K",
// 5_500_000 → "5.5M". Mirrors the marketplace's formatWeiToAssetCard (Intl compact, 2 fraction
// digits) so credit prices read the same as MANA prices do there. Pair with a title/tooltip showing
// the full number (via formatCreditsFull) since the compact form is lossy.
const compactFormatter = Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 })
export function formatCredits(n: number): string {
  return compactFormatter.format(n)
}

// Full grouped number for tooltips / exact contexts: 5_500_000 → "5,500,000".
export function formatCreditsFull(n: number): string {
  return n.toLocaleString('en')
}
