/** A date and time in the viewer's locale and zone, e.g. "Nov 27, 2026, 9:00 AM". */
export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

/** A camera reel photo's date. The service hands epoch SECONDS, as a string. */
export function formatPhotoDate(dateTime: string): string {
  const seconds = Number(dateTime)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(seconds * 1000))
}
