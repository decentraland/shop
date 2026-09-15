import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

import { countSales, fetchSellerSales, type SaleRow } from '~/lib/sales'

const SELLER = '0xseller'

function row(id: number): SaleRow {
  return {
    id: `s${id}`,
    itemId: '0',
    contractAddress: '0xcollection',
    buyer: '0xbuyer',
    seller: SELLER,
    price: '1000000000000000000',
    timestamp: 1_760_000_000_000,
    type: 'mint',
    network: 'MATIC',
    tokenId: null
  }
}

/** Serves `total` rows a page at a time, honouring the `first`/`skip` the client sends. */
function mockFeed(total: number) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const params = new URL(url).searchParams
    const first = Number(params.get('first'))
    const skip = Number(params.get('skip') ?? 0)
    const data = Array.from({ length: Math.max(0, Math.min(first, total - skip)) }, (_, i) => row(skip + i))
    return { ok: true, status: 200, json: async () => ({ data, total }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when counting a seller"s sales', () => {
  it('should ask for a single row and read only the total', async () => {
    const fetchMock = mockFeed(4200)

    await expect(countSales({ seller: SELLER })).resolves.toBe(4200)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v1/sales')
    expect(url.searchParams.get('first')).toBe('1')
    expect(url.searchParams.get('seller')).toBe(SELLER)
  })

  it('should forward the window and the item it is asked about', async () => {
    const fetchMock = mockFeed(1)

    await countSales({ seller: SELLER, contractAddress: '0xcollection', itemId: '3', from: 1000, to: 2000 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('contractAddress')).toBe('0xcollection')
    expect(url.searchParams.get('itemId')).toBe('3')
    expect(url.searchParams.get('from')).toBe('1000')
    expect(url.searchParams.get('to')).toBe('2000')
  })
})

describe('when fetching a seller"s sales', () => {
  it('should stop after one request when the window fits in a page', async () => {
    const fetchMock = mockFeed(12)

    const { rows, total, truncated } = await fetchSellerSales({ seller: SELLER })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(12)
    expect(total).toBe(12)
    expect(truncated).toBe(false)
  })

  it('should page until it has the whole window', async () => {
    const fetchMock = mockFeed(600)

    const { rows, truncated } = await fetchSellerSales({ seller: SELLER })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(rows).toHaveLength(600)
    expect(new Set(rows.map(r => r.id)).size).toBe(600)
    expect(truncated).toBe(false)
  })

  it('should stop at the cap and say the figures cover part of the window', async () => {
    const fetchMock = mockFeed(5000)

    const { rows, total, truncated } = await fetchSellerSales({ seller: SELLER }, { cap: 500 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(rows).toHaveLength(500)
    expect(total).toBe(5000)
    expect(truncated).toBe(true)
  })

  it('should reject when the feed fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, body: null, json: async () => ({}) }))

    await expect(fetchSellerSales({ seller: SELLER })).rejects.toThrow('fetchSales 502')
  })
})
