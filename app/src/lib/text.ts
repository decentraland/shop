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
