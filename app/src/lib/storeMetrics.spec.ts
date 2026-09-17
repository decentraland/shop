import { describe, it, expect } from 'vitest'
import {
  collectorsOf,
  daysSinceLastSale,
  deltaOf,
  deltaOfWei,
  saleLift,
  topBuyers,
  wantedButUnsold
} from './storeMetrics'
import type { SaleRow } from './sales'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 0, 31, 12, 0, 0, 0)

function row(over: Partial<SaleRow> & { daysAgo: number }): SaleRow {
  const { daysAgo, ...rest } = over
  return {
    id: `s-${daysAgo}-${over.buyer ?? 'x'}`,
    itemId: '0',
    contractAddress: '0xabc',
    buyer: '0xbuyer1',
    seller: '0xseller',
    price: '1000000000000000000',
    timestamp: NOW - daysAgo * DAY,
    type: 'mint',
    network: 'MATIC',
    tokenId: null,
    ...rest
  }
}

describe('deltaOf', () => {
  it('reads a rise as a percentage of what came before', () => {
    expect(deltaOf(15, 9)).toEqual({ current: 15, previous: 9, pct: expect.closeTo(66.67, 1) })
  })

  it('reads a fall as a negative one', () => {
    expect(deltaOf(4, 8).pct).toBe(-50)
  })

  // A rise from nothing has no percentage. Inventing one would divide by zero, and picking a stand-in
  // number would tell a creator their first month grew by some amount over a month that did not happen.
  it('refuses a percentage when there was no baseline', () => {
    expect(deltaOf(7, 0).pct).toBeNull()
  })

  it('is flat at zero rather than absent when nothing happened either time', () => {
    expect(deltaOf(0, 0)).toEqual({ current: 0, previous: 0, pct: null })
  })
})

describe('deltaOfWei', () => {
  it('compares earnings without losing the large ones to floating point', () => {
    const current = 15_000_000_000_000_000_000_000n
    const previous = 12_000_000_000_000_000_000_000n
    expect(deltaOfWei(current, previous).pct).toBe(25)
  })

  it('refuses a percentage against nothing earned', () => {
    expect(deltaOfWei(5n, 0n).pct).toBeNull()
  })
})

describe('collectorsOf', () => {
  const rows = [
    row({ daysAgo: 1, buyer: '0xAAA' }),
    row({ daysAgo: 2, buyer: '0xaaa' }),
    row({ daysAgo: 3, buyer: '0xbbb' }),
    row({ daysAgo: 4, buyer: '0xccc' }),
    row({ daysAgo: 5, buyer: '0xccc' }),
    row({ daysAgo: 6, buyer: '0xccc' })
  ]

  it('counts people rather than sales, whatever case the address arrives in', () => {
    const collectors = collectorsOf(rows)
    expect(collectors.total).toBe(3)
    expect(collectors.repeat).toBe(2)
    expect(collectors.repeatPct).toBeCloseTo(66.67, 1)
  })

  it('ranks the most frequent buyers first', () => {
    expect(collectorsOf(rows, 2).top).toEqual([
      { address: '0xccc', bought: 3 },
      { address: '0xaaa', bought: 2 }
    ])
  })

  it('reports nobody rather than dividing by nobody', () => {
    expect(collectorsOf([])).toEqual({ total: 0, repeat: 0, repeatPct: 0, topSharePct: 0, top: [] })
  })

  /**
   * Taken from a real store: 2,206 sales in a month, of which one address took 2,202. Its headline read
   * like a thriving shop and its actual customer list was four people and a bot. This is the number that
   * says so, and it is why the count of buyers alone is not enough.
   */
  it('says how much of the store one buyer accounts for', () => {
    const lopsided = [
      ...Array.from({ length: 9 }, (_, i) => row({ daysAgo: i, buyer: '0xwhale' })),
      row({ daysAgo: 10, buyer: '0xsomeone' })
    ]
    expect(collectorsOf(lopsided).topSharePct).toBe(90)
  })
})

describe('topBuyers', () => {
  const rows = [
    // Nine copies of one item, from one collection: a fan of the item.
    ...Array.from({ length: 9 }, (_, i) => row({ daysAgo: i, buyer: '0xfan', itemId: '0' })),
    // One thing from each of three collections: a fan of the creator.
    row({ daysAgo: 1, buyer: '0xspread', itemId: '0', contractAddress: '0xaaa', price: '9000000000000000000' }),
    row({ daysAgo: 2, buyer: '0xspread', itemId: '1', contractAddress: '0xbbb', price: '9000000000000000000' }),
    row({ daysAgo: 3, buyer: '0xspread', itemId: '2', contractAddress: '0xccc', price: '9000000000000000000' })
  ]

  it('tells the two apart, which the count of sales alone cannot', () => {
    const [first, second] = topBuyers(rows)

    expect(second).toMatchObject({ address: '0xfan', bought: 9, items: 1, collections: 1 })
    expect(first).toMatchObject({ address: '0xspread', bought: 3, items: 3, collections: 3 })
  })

  it('ranks by what they spent, since that is the figure a creator is looking for', () => {
    // The spread buyer paid 27 against the fan's 9, so they lead despite a third of the sales.
    expect(topBuyers(rows)[0].spentWei).toBe(27_000_000_000_000_000_000n)
  })

  it('dates each one by their most recent purchase, not their first', () => {
    expect(topBuyers(rows).find(b => b.address === '0xfan')?.lastAt).toBe(NOW)
  })

  // A resale is on a token, not an item, so it cannot say which of the creator's items somebody owns.
  it('counts a sale with no item towards the collection and the spend but not the items', () => {
    const [only] = topBuyers([row({ daysAgo: 1, buyer: '0xone', itemId: null, type: 'order' })])
    expect(only).toMatchObject({ bought: 1, items: 0, collections: 1 })
  })

  it('keeps only as many as asked for', () => {
    expect(topBuyers(rows, 1)).toHaveLength(1)
  })
})

describe('daysSinceLastSale', () => {
  it('measures from the most recent sale, not the oldest', () => {
    expect(daysSinceLastSale([row({ daysAgo: 12 }), row({ daysAgo: 3 })], NOW)).toBe(3)
  })

  it('says nothing rather than zero when the rows hold no sale', () => {
    expect(daysSinceLastSale([], NOW)).toBeNull()
  })
})

describe('saleLift', () => {
  // A discount live for four days, with the four days before it to compare against.
  const sale = { effective: NOW - 4 * DAY, expiration: NOW + 3 * DAY }
  const rows = [
    row({ daysAgo: 1 }),
    row({ daysAgo: 2 }),
    row({ daysAgo: 2.5 }),
    row({ daysAgo: 3 }),
    row({ daysAgo: 5 }),
    row({ daysAgo: 7 }),
    // Fetched, and older than the comparison window, which is what makes the window trustworthy.
    row({ daysAgo: 20 })
  ]

  it('compares each stretch by the day, since they are not the same length in the end', () => {
    const lift = saleLift(rows, sale, NOW)

    expect(lift?.during).toBe(4)
    expect(lift?.before).toBe(2)
    expect(lift?.days).toBe(4)
    expect(lift?.liftPct).toBe(100)
  })

  it('stops the live stretch at today, not at the day the discount is booked to end', () => {
    expect(saleLift(rows, sale, NOW)?.days).toBe(4)
  })

  it('reports no lift rather than an infinite one when nothing sold before', () => {
    const quiet = [row({ daysAgo: 1 }), row({ daysAgo: 30 })]
    expect(saleLift(quiet, sale, NOW)?.liftPct).toBeNull()
  })

  /**
   * The failure this guards against is the flattering one. The rows only cover the window that was
   * fetched; if the stretch before the discount falls outside them, every sale that was never fetched
   * reads as a sale that never happened, and the discount looks like it doubled a store that was already
   * selling.
   */
  it('refuses to answer when the rows do not reach back far enough to compare', () => {
    const shallow = [row({ daysAgo: 1 }), row({ daysAgo: 4.5 })]
    expect(saleLift(shallow, sale, NOW)).toBeNull()
  })

  /**
   * A discount covers part of a store, so it is measured against that part. How far back the reading can
   * be trusted is a property of the FETCH, not of the subset, which is why the caller passes it: judging
   * coverage by a quiet collection's own oldest sale would refuse to measure exactly the collection a
   * creator puts a discount on.
   */
  it('trusts the coverage it is told about rather than the oldest row it was handed', () => {
    const quietCollection = [row({ daysAgo: 1 }), row({ daysAgo: 3 })]
    expect(saleLift(quietCollection, sale, NOW)).toBeNull()
    expect(saleLift(quietCollection, sale, NOW, NOW - 30 * DAY)?.during).toBe(2)
  })

  it('has nothing to say about a discount that has not started', () => {
    expect(saleLift(rows, { effective: NOW + DAY, expiration: NOW + 5 * DAY }, NOW)).toBeNull()
  })
})

describe('wantedButUnsold', () => {
  const items = [
    { key: 'a', name: 'Galaxy Hat', sold: 0 },
    { key: 'b', name: 'Galaxy Boots', sold: 3 },
    { key: 'c', name: 'Galaxy Cape', sold: 0 },
    { key: 'd', name: 'Galaxy Crown', sold: 0 }
  ]
  const saves = new Map([
    ['a', 12],
    ['b', 40],
    ['c', 31]
  ])

  it('keeps only what people saved and nobody bought, most wanted first', () => {
    expect(wantedButUnsold(items, saves)).toEqual([
      { key: 'c', name: 'Galaxy Cape', saves: 31, sold: 0 },
      { key: 'a', name: 'Galaxy Hat', saves: 12, sold: 0 }
    ])
  })

  // An item nobody saved and nobody bought is the ordinary case; listing it would bury the finding.
  it('leaves out an item nobody has saved', () => {
    expect(wantedButUnsold(items, saves).some(item => item.key === 'd')).toBe(false)
  })
})
