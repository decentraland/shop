/** A date and time in the viewer's locale and zone, e.g. "Nov 27, 2026, 9:00 AM". */
export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}
