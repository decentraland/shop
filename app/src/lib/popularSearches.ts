/**
 * What the empty search box offers a reader who has searched nothing yet.
 *
 * The eight queries people typed most, among those that find something, in the 60 days of search
 * telemetry to 2026-09-21 (`shop_searched`; "duck" 22 times, "sword" 14, "kimono" and "top" 11 — "top"
 * left out as too generic — "doki" and "wings" 10, then "dance", "dress", "glow" and "hoodie"). Reviewed
 * against the telemetry when the numbers move; not served from anywhere. These are queries, not copy:
 * they are typed by readers in whatever language, and are not translated.
 */
export const POPULAR_SEARCHES = ['duck', 'sword', 'kimono', 'wings', 'dance', 'hoodie', 'dress', 'glow']

/** The popular searches a reader has not already got among their recent ones, case aside. */
export function popularSearchesFor(recent: string[]): string[] {
  const seen = new Set(recent.map(term => term.trim().toLowerCase()))
  return POPULAR_SEARCHES.filter(term => !seen.has(term))
}
