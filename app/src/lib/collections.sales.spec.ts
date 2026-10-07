import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

const coupon = { discountType: 1, discount: 500_000, checks: { uses: 10 } }
const fetchShopListingsRaw = vi.fn()
vi.mock('~/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/api')>()),
  fetchShopListingsRaw: (...args: unknown[]) => fetchShopListingsRaw(...args)
}))

import { fetchCreatorItems } from '~/lib/collections'

afterEach(() => {
  vi.unstubAllGlobals()
  fetchShopListingsRaw.mockReset()
})

describe('when a creator page lists an item a creator discount covers', () => {
  it('should carry the coupon, so the badge reads its own % and the cart settles at the sale price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'hat',
              name: 'Cool Hat',
              contractAddress: '0xcollection',
              itemId: '7',
              category: 'wearable',
              network: 'MATIC',
              chainId: 137,
              priceCredits: 5
            }
          ]
        })
      })
    )
    fetchShopListingsRaw.mockResolvedValue({
      creatorSalesLive: true,
      total: 1,
      listings: [{ contractAddress: '0xcollection', itemId: '7', priceCredits: 3, compareAtCredits: 5, coupon }]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({ priceCredits: 3, compareAtCredits: 5, coupon })
  })
})
