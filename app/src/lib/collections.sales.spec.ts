import { describe, it, expect, vi, afterEach } from 'vitest'
import type { UnifiedListing } from '~/lib/api'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

const coupon = { discountType: 1, discount: 300_000, checks: { uses: 10 } }
const fetchUnified = vi.fn()
vi.mock('~/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/api')>()),
  fetchUnified: (...args: unknown[]) => fetchUnified(...args)
}))

import { fetchCatalogItems, fetchCreatorItems } from '~/lib/collections'

const catalogRow = (over: Record<string, unknown> = {}) => ({
  id: 'hat',
  name: 'Cool Hat',
  contractAddress: '0xcollection',
  itemId: '7',
  category: 'wearable',
  network: 'MATIC',
  chainId: 137,
  priceCredits: 5,
  ...over
})

const stubCatalog = (rows: Record<string, unknown>[]) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: rows }) }))

const listing = (over: Partial<UnifiedListing>) =>
  ({ contractAddress: '0xcollection', itemId: '7', ...over }) as UnifiedListing

afterEach(() => {
  vi.unstubAllGlobals()
  fetchUnified.mockReset()
})

describe('when a creator page lists an item a creator discount covers', () => {
  it('should carry the coupon, so the badge reads its own % and the cart settles at the sale price', async () => {
    stubCatalog([catalogRow()])
    fetchUnified.mockResolvedValue({
      total: 1,
      items: [
        listing({ priceCredits: 3, compareAtCredits: 5, coupon: coupon as UnifiedListing['coupon'], manaWei: null })
      ]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({ priceCredits: 3, compareAtCredits: 5, coupon })
  })

  it('should ask the unified feed for every mint listing in scope, the one that carries MANA listings', async () => {
    stubCatalog([catalogRow()])
    fetchUnified.mockResolvedValue({ total: 0, items: [] })

    await fetchCreatorItems('0xartist')

    const [params] = fetchUnified.mock.calls[0] as [Record<string, unknown>]
    expect(params).toMatchObject({ creator: '0xartist', listingType: 'primary' })
    // Undiscounted listings too: the one the item page would pick may be the undiscounted one.
    expect(params.discounted).toBeUndefined()
  })

  it('should overlay a collection page by its contract the same way', async () => {
    stubCatalog([catalogRow()])
    fetchUnified.mockResolvedValue({
      total: 1,
      items: [
        listing({ priceCredits: 3, compareAtCredits: 5, coupon: coupon as UnifiedListing['coupon'], manaWei: null })
      ]
    })

    const { items } = await fetchCatalogItems({ contractAddress: '0xcollection' })

    expect(fetchUnified).toHaveBeenCalledWith(expect.objectContaining({ contractAddress: '0xcollection' }))
    expect(items[0]).toMatchObject({ priceCredits: 3, compareAtCredits: 5 })
  })

  it("should bring a MANA listing's sale and list amounts, so the page re-prices the sale at the live rate", async () => {
    stubCatalog([catalogRow({ priceCredits: 27, price: '10000000000000000000' })])
    fetchUnified.mockResolvedValue({
      total: 1,
      items: [
        listing({
          priceCredits: 19,
          compareAtCredits: 27,
          saleEndsAt: 1_792_934_836_000,
          coupon: coupon as UnifiedListing['coupon'],
          manaWei: '7000000000000000000',
          listManaWei: '10000000000000000000'
        })
      ]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({
      priceCredits: 19,
      compareAtCredits: 27,
      saleEndsAt: 1_792_934_836_000,
      manaWei: '7000000000000000000',
      listManaWei: '10000000000000000000'
    })
  })

  it('should not re-price a USD-pegged sale from the MANA store price the catalogue row carries', async () => {
    // isOnSale + price with no trade: the catalogue reads this row as a MANA store mint and gives it a manaWei.
    stubCatalog([catalogRow({ priceCredits: 27, price: '10000000000000000000', isOnSale: true })])
    fetchUnified.mockResolvedValue({
      total: 1,
      items: [
        listing({
          source: 'native',
          priceCredits: 20,
          compareAtCredits: 25,
          coupon: coupon as UnifiedListing['coupon'],
          manaWei: null
        })
      ]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({ priceCredits: 20, compareAtCredits: 25 })
    expect(items[0].manaWei).toBeUndefined()
  })

  it('should not advertise a MANA sale when the item page would sell its undiscounted USD-pegged listing', async () => {
    stubCatalog([catalogRow({ priceCredits: 25 })])
    fetchUnified.mockResolvedValue({
      total: 2,
      items: [
        listing({ source: 'legacy', priceCredits: 15, compareAtCredits: 27, manaWei: '7000000000000000000' }),
        listing({ source: 'native', priceCredits: 25, manaWei: null })
      ]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0].priceCredits).toBe(25)
    expect(items[0].compareAtCredits).toBeUndefined()
  })

  it('should take the sale of the listing the item page would sell, not the cheapest one', async () => {
    stubCatalog([catalogRow()])
    fetchUnified.mockResolvedValue({
      total: 2,
      items: [
        listing({ source: 'legacy', priceCredits: 15, compareAtCredits: 27, manaWei: '7000000000000000000' }),
        listing({ source: 'native', priceCredits: 18, compareAtCredits: 22, manaWei: null })
      ]
    })

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({ priceCredits: 18, compareAtCredits: 22 })
  })

  it('should leave the page as it was when the overlay cannot resolve', async () => {
    stubCatalog([catalogRow()])
    fetchUnified.mockRejectedValue(new Error('down'))

    const { items } = await fetchCreatorItems('0xartist')

    expect(items[0]).toMatchObject({ priceCredits: 5 })
    expect(items[0].compareAtCredits).toBeUndefined()
  })
})
