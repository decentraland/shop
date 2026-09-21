/** A date and time in the viewer's locale and zone, e.g. "Nov 27, 2026, 9:00 AM". */
export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

/** A date with no time, e.g. "Jul 29, 2026" — for a deadline, where the hour is noise. */
export function shortDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms))
}
