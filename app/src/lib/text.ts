import { useLocale } from '~/store/locale'

// Uppercase just the FIRST character, leaving the rest untouched — so "bondi" → "Bondi" and
// "really cool stuff" → "Really cool stuff" (not "Really Cool Stuff"). Safe on empty/undefined.
export function capitalizeFirst(s?: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// A count as a reader expects to see it: grouped by thousands for the active locale (1234 → "1,234").
// Creator totals reach four and five figures, and an ungrouped run of digits is read digit by digit.
export function formatCount(n: number): string {
  return n.toLocaleString()
}

const compactCounts = new Map<string, Intl.NumberFormat>()

function activeLocale(): string {
  try {
    return useLocale.getState?.().locale ?? 'en'
  } catch {
    return 'en'
  }
}

/** A count for a tight label: exact below 10,000, compact above ("1M"), truncated so it never rounds up. */
export function formatCountCompact(n: number, locale: string = activeLocale()): string {
  if (n < 10_000) return n.toLocaleString(locale)
  let f = compactCounts.get(locale)
  if (!f) {
    f = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2, roundingMode: 'trunc' })
    compactCounts.set(locale, f)
  }
  return f.format(n)
}
