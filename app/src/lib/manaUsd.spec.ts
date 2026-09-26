import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

import { dayOf, fetchManaUsdRates, formatUsd, usdBy, usdOfSale, usdOfWei } from '~/lib/manaUsd'
import type { SaleRow } from '~/lib/sales'

const MANA = 10n ** 18n

function sale(overrides: Partial<SaleRow>): SaleRow {
  return {
    id: '1',
    itemId: '0',
    contractAddress: '0xc',
    buyer: '0xb',
    seller: '0xs',
    price: String(10n * MANA),
    timestamp: Date.parse('2026-09-25T15:00:00Z'),
    type: 'mint',
    network: 'MATIC',
    tokenId: null,
    ...overrides
  }
}

describe('when converting MANA to dollars', () => {
  it('should multiply the amount by the rate', () => {
    expect(usdOfWei(25n * MANA, 0.1)).toBeCloseTo(2.5, 10)
  })

  it('should key a moment by its UTC day', () => {
    expect(dayOf(Date.parse('2026-09-25T23:30:00-03:00'))).toBe('2026-09-26')
  })

  describe('and the sale falls on a day with a rate', () => {
    it('should price it at that day', () => {
      expect(usdOfSale(sale({}), new Map([['2026-09-25', 0.5]]))).toBeCloseTo(5, 10)
    })
  })

  describe('and the sale falls on a day without a rate', () => {
    it('should say it cannot be priced', () => {
      expect(usdOfSale(sale({}), new Map())).toBeNull()
    })
  })
})

describe('when summing sales in dollars by key', () => {
  it('should total each key and count the sales with no rate', () => {
    const book = new Map([['2026-09-25', 0.5]])
    const rows = [
      sale({ buyer: '0xa' }),
      sale({ buyer: '0xa', price: String(2n * MANA) }),
      sale({ buyer: '0xb', timestamp: Date.parse('2020-01-01T00:00:00Z') })
    ]

    const { totals, unpriced } = usdBy(rows, book, row => row.buyer)

    expect(totals.get('0xa')).toBeCloseTo(6, 10)
    expect(totals.has('0xb')).toBe(false)
    expect(unpriced).toBe(1)
  })
})

describe('when writing dollars', () => {
  it('should keep cents under a hundred', () => {
    expect(formatUsd(9.5, 'en')).toBe('9.50')
  })

  it('should round to whole dollars above a hundred', () => {
    expect(formatUsd(1234.56, 'en')).toBe('1,235')
  })
})

describe('when reading the daily rates', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return them keyed by day', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ day: '2026-09-25', usd: '0.09302823' }] }), { status: 200 })
    )

    const book = await fetchManaUsdRates(1000, 2000)

    expect(book.get('2026-09-25')).toBeCloseTo(0.09302823, 10)
    expect(fetchMock).toHaveBeenCalledWith('http://mps.test/v1/rates/mana-usd?from=1000&to=2000')
  })

  it('should throw when the server fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }))

    await expect(fetchManaUsdRates(1000, 2000)).rejects.toThrow('fetchManaUsdRates 404')
  })
})
