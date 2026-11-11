export type SortDir = 'asc' | 'desc'

export type ColumnSort<K extends string> = { key: K; dir: SortDir }

type SortValue = string | number | bigint | null | undefined

/**
 * The sort after a click on `key`'s header: the same column flips direction, a new one starts at `firstDir`.
 *
 * Numbers start descending (the biggest is what a creator looks for first) and text ascending, which is why
 * the first direction is the caller's to pick.
 */
export function nextSort<K extends string>(current: ColumnSort<K> | null, key: K, firstDir: SortDir): ColumnSort<K> {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: firstDir }
}

/** A sorted copy. Ties keep their incoming order, and a missing value always goes last whatever the direction. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => {
      const missingA = a.v == null
      const missingB = b.v == null
      if (missingA || missingB) return missingA === missingB ? a.index - b.index : missingA ? 1 : -1
      return sign * compare(a.v as NonNullable<SortValue>, b.v as NonNullable<SortValue>) || a.index - b.index
    })
    .map(entry => entry.row)
}

function compare(a: string | number | bigint, b: string | number | bigint): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { sensitivity: 'base' })
  if (a === b) return 0
  return a < b ? -1 : 1
}
