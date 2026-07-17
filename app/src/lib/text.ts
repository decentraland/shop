// Uppercase just the FIRST character, leaving the rest untouched — so "bondi" → "Bondi" and
// "really cool stuff" → "Really cool stuff" (not "Really Cool Stuff"). Safe on empty/undefined.
export function capitalizeFirst(s?: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
