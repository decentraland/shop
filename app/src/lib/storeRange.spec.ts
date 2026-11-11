import { describe, it, expect } from 'vitest'
import { bucketStarts, bucketUnit, comparisonRange, resolveRange, seriesOf } from '~/lib/storeRange'
import type { SaleRow } from '~/lib/sales'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 25, 15, 30).getTime()
const endOfToday = new Date(2026, 8, 25, 23, 59, 59, 999).getTime()

function row(timestamp: number, price = '1000'): SaleRow {
  return {
    id: String(timestamp),
    itemId: '0',
    contractAddress: '0xabc',
    buyer: '0xbuyer',
    seller: '0xseller',
    price,
    timestamp,
    type: 'mint',
    network: 'MATIC',
    tokenId: null
  }
}

describe('when resolving a range', () => {
  describe('and it is a preset of days', () => {
    it('should cover that many calendar days ending today', () => {
      const range = resolveRange({ key: '7d' }, NOW)

      expect(range).toEqual({ from: new Date(2026, 8, 19).getTime(), to: endOfToday, days: 7 })
    })
  })

  describe('and it is this year', () => {
    it('should start on the first of January', () => {
      expect(resolveRange({ key: 'year' }, NOW).from).toBe(new Date(2026, 0, 1).getTime())
    })
  })

  describe('and it is all time', () => {
    it('should have no start and no length', () => {
      expect(resolveRange({ key: 'all' }, NOW)).toEqual({ from: undefined, to: endOfToday, days: null })
    })
  })

  describe('and it is custom', () => {
    it('should run from the start of its first day to the end of its last', () => {
      const range = resolveRange(
        { key: 'custom', from: new Date(2026, 5, 1).getTime(), to: new Date(2026, 5, 30).getTime() },
        NOW
      )

      expect(range).toEqual({
        from: new Date(2026, 5, 1).getTime(),
        to: new Date(2026, 5, 30, 23, 59, 59, 999).getTime(),
        days: 30
      })
    })

    it('should stop at today when it ends in the future', () => {
      const range = resolveRange({ key: 'custom', from: new Date(2026, 8, 1).getTime(), to: NOW + 30 * DAY }, NOW)

      expect(range.to).toBe(endOfToday)
    })
  })
})

describe('when choosing what a range is compared against', () => {
  const range = resolveRange({ key: '30d' }, NOW)

  describe('and it is the previous period', () => {
    it('should be the same length, ending right before the range starts', () => {
      const previous = comparisonRange(range, 'previous')

      expect(previous).toEqual({ from: (range.from as number) - 30 * DAY, to: (range.from as number) - 1 })
    })
  })

  describe('and it is the same period last year', () => {
    it('should be the same calendar days a year earlier', () => {
      const lastYear = comparisonRange(range, 'year')

      expect(new Date(lastYear!.from).getFullYear()).toBe(2025)
      expect(new Date(lastYear!.from).getDate()).toBe(new Date(range.from as number).getDate())
    })
  })

  describe('and it is last year for a range that ends on a leap day', () => {
    it('should end on 28 February rather than roll into March', () => {
      const leap = resolveRange(
        { key: 'custom', from: new Date(2028, 1, 20).getTime(), to: new Date(2028, 1, 29).getTime() },
        new Date(2028, 5, 1).getTime()
      )

      const lastYear = comparisonRange(leap, 'year')

      expect(new Date(lastYear!.to).getMonth()).toBe(1)
      expect(new Date(lastYear!.to).getDate()).toBe(28)
    })
  })

  describe('and it is the previous period across a clock change', () => {
    it('should still start on a day boundary, the same number of days back', () => {
      // Spans the European spring-forward of 29 March 2026 whatever the test machine's zone.
      const range = resolveRange({ key: '7d' }, new Date(2026, 3, 2, 12).getTime())

      const previous = comparisonRange(range, 'previous')!

      expect(new Date(previous.from).getHours()).toBe(0)
      expect(Math.round((range.from! - previous.from) / DAY)).toBe(7)
    })
  })

  describe('and the range is all time', () => {
    it('should compare against nothing', () => {
      expect(comparisonRange(resolveRange({ key: 'all' }, NOW), 'previous')).toBeNull()
    })
  })

  describe('and comparing is off', () => {
    it('should compare against nothing', () => {
      expect(comparisonRange(range, 'none')).toBeNull()
    })
  })
})

describe('when choosing how finely to draw a span', () => {
  it('should draw a month by day', () => {
    expect(bucketUnit(0, 30 * DAY)).toBe('day')
  })

  it('should draw a year by week', () => {
    expect(bucketUnit(0, 365 * DAY)).toBe('week')
  })

  it('should draw several years by month', () => {
    expect(bucketUnit(0, 3 * 365 * DAY)).toBe('month')
  })
})

describe('when laying out buckets', () => {
  describe('and they are days', () => {
    it('should start one on each day of the span', () => {
      const from = new Date(2026, 8, 1).getTime()

      expect(bucketStarts(from, from + 2 * DAY + 5, 'day')).toEqual([from, from + DAY, from + 2 * DAY])
    })
  })

  describe('and they are months', () => {
    it('should start each on the first of the month', () => {
      const starts = bucketStarts(new Date(2026, 0, 15).getTime(), new Date(2026, 2, 10).getTime(), 'month')

      expect(starts.map(start => new Date(start).getMonth())).toEqual([0, 1, 2])
      expect(starts.every(start => new Date(start).getDate() === 1)).toBe(true)
    })
  })
})

describe('when building a series from sales', () => {
  const from = new Date(2026, 8, 1).getTime()
  const starts = bucketStarts(from, from + 3 * DAY - 1, 'day')

  it('should count and sum each sale into the bucket it falls in', () => {
    const series = seriesOf(
      [row(from + 10), row(from + DAY + 10, '500'), row(from + DAY + 20, '250')],
      starts,
      from + 3 * DAY - 1
    )

    expect(series.map(point => point.sales)).toEqual([1, 2, 0])
    expect(series.map(point => point.earnedWei)).toEqual([1000n, 750n, 0n])
  })

  it('should leave out sales outside the span', () => {
    const series = seriesOf([row(from - 1), row(from + 3 * DAY)], starts, from + 3 * DAY - 1)

    expect(series.map(point => point.sales)).toEqual([0, 0, 0])
  })
})
