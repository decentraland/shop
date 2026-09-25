import { weiOf, type SaleRow } from '~/lib/sales'

const DAY_MS = 86_400_000

export type RangeKey = '7d' | '30d' | '90d' | 'year' | 'all' | 'custom'

/** The period the store dashboard reads. `from`/`to` are only read for `custom`, as local calendar days. */
export type StoreRange = { key: RangeKey; from?: number; to?: number }

/** A range pinned to instants: `from` inclusive (undefined for all time), `to` inclusive, and its length. */
export type ResolvedRange = { from: number | undefined; to: number; days: number | null }

export type CompareMode = 'previous' | 'year' | 'none'

export const RANGE_KEYS: RangeKey[] = ['7d', '30d', '90d', 'year', 'all', 'custom']

const PRESET_DAYS: Partial<Record<RangeKey, number>> = { '7d': 7, '30d': 30, '90d': 90 }

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * The instants a range covers, ending at the close of today (or of the custom range's last day).
 *
 * Pinned to day boundaries so the value is stable for the whole day and can key a query without
 * refetching on every render.
 */
export function resolveRange(range: StoreRange, now: number): ResolvedRange {
  const to = endOfDay(range.key === 'custom' && range.to != null ? Math.min(range.to, now) : now)
  if (range.key === 'all') return { from: undefined, to, days: null }
  let from: number
  if (range.key === 'custom' && range.from != null) from = startOfDay(Math.min(range.from, to))
  else if (range.key === 'year') from = startOfDay(new Date(new Date(to).getFullYear(), 0, 1).getTime())
  else from = addDays(startOfDay(to), -((PRESET_DAYS[range.key] ?? 30) - 1))
  return { from, to, days: Math.max(1, Math.round((to + 1 - from) / DAY_MS)) }
}

/** The window a figure is compared against, or null when there is nothing to compare with (all time, or off). */
export function comparisonRange(range: ResolvedRange, mode: CompareMode): { from: number; to: number } | null {
  if (range.from == null || mode === 'none') return null
  if (mode === 'year') return { from: yearEarlier(range.from), to: yearEarlier(range.to) }
  // Calendar days rather than a millisecond length, so a window across a clock change keeps its day count.
  const days = range.days ?? Math.max(1, Math.round((range.to + 1 - range.from) / DAY_MS))
  return { from: addDays(range.from, -days), to: range.from - 1 }
}

/** The same local time on the same calendar day, `n` days later (or earlier), whatever the clock changes in between. */
function addDays(ms: number, n: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** The same moment a year earlier; 29 February becomes the 28th rather than rolling into March. */
function yearEarlier(ms: number): number {
  const d = new Date(ms)
  const leapDay = d.getMonth() === 1 && d.getDate() === 29
  if (leapDay) d.setDate(28)
  d.setFullYear(d.getFullYear() - 1)
  return d.getTime()
}

export type BucketUnit = 'day' | 'week' | 'month'

/**
 * How finely a span is drawn: days up to two months, weeks up to about a year, months past that.
 *
 * Coarser than one point per day on purpose past a couple of months: a year of daily points holding a
 * handful of sales each is a comb of spikes, not a trend.
 */
export function bucketUnit(from: number, to: number): BucketUnit {
  const days = (to - from) / DAY_MS
  if (days <= 62) return 'day'
  if (days <= 400) return 'week'
  return 'month'
}

/** Bucket start instants covering [from, to], in order. Weeks start on the range's first day, not on a Monday. */
export function bucketStarts(from: number, to: number, unit: BucketUnit): number[] {
  const starts: number[] = []
  const cursor = new Date(startOfDay(from))
  if (unit === 'month') cursor.setDate(1)
  while (cursor.getTime() <= to) {
    starts.push(cursor.getTime())
    if (unit === 'day') cursor.setDate(cursor.getDate() + 1)
    else if (unit === 'week') cursor.setDate(cursor.getDate() + 7)
    else cursor.setMonth(cursor.getMonth() + 1)
  }
  return starts
}

export type SeriesPoint = { start: number; sales: number; earnedWei: bigint }

/** Sales and earnings per bucket. Rows outside [starts[0], to] are ignored. */
export function seriesOf(rows: SaleRow[], starts: number[], to: number): SeriesPoint[] {
  const points = starts.map(start => ({ start, sales: 0, earnedWei: 0n }))
  if (points.length === 0) return points
  for (const row of rows) {
    if (row.timestamp < starts[0] || row.timestamp > to) continue
    let index = starts.length - 1
    while (index > 0 && starts[index] > row.timestamp) index -= 1
    points[index].sales += 1
    points[index].earnedWei += weiOf(row.price)
  }
  return points
}
