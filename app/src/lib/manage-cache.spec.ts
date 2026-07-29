import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { patchManageCaches } from '~/lib/manage-cache'
import type { MyAsset } from '~/lib/api'

const ADDRESS = '0xowner'
const CONTRACT = '0xcontract'
const TOKEN = '42'
const KEY = `${CONTRACT}-${TOKEN}`

// A minimal owned wearable row (the fields the sale-state UI reads).
function asset(overrides: Partial<MyAsset> = {}): MyAsset {
  return {
    id: KEY,
    contractAddress: CONTRACT,
    tokenId: TOKEN,
    itemId: '1',
    name: 'Hat',
    category: 'wearable',
    image: '',
    network: 'MATIC',
    chainId: 137,
    isOnSale: false,
    listingPrice: undefined,
    tradeId: undefined,
    ...overrides
  }
}

type MyAssetsPage = { items: MyAsset[]; total: number }
type SecondarySaleMap = Record<string, { priceCredits: number; tradeId: string }>

function seed(qc: QueryClient) {
  // (a) PDP owned-token detail cache — note the trailing address segment the helper must match past.
  qc.setQueryData<MyAsset | null>(['owned-token', CONTRACT, TOKEN, ADDRESS], asset())
  // (b) My Assets grid — an infinite query with the full multi-segment key the page uses.
  qc.setQueryData<InfiniteData<MyAssetsPage>>(['my-assets', ADDRESS, 'wearables', 'all', [], null, '', 'newest'], {
    pages: [{ items: [asset({ id: 'other', tokenId: '7' }), asset()], total: 2 }],
    pageParams: [0]
  })
  // (c) shop-feed secondary sale map — keyed by ownedContracts array.
  qc.setQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]], {})
}

describe('patchManageCaches', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient()
    seed(qc)
  })

  describe('when a token is listed', () => {
    it('should mark the owned-token detail cache on sale at the new price with the new trade id', () => {
      patchManageCaches(
        qc,
        { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN },
        {
          kind: 'listed',
          priceCredits: 5,
          tradeId: 'trade-1'
        }
      )
      const detail = qc.getQueryData<MyAsset | null>(['owned-token', CONTRACT, TOKEN, ADDRESS])
      expect(detail).toMatchObject({ isOnSale: true, listingPrice: 5, tradeId: 'trade-1' })
    })

    it('should patch the matching row in the My Assets grid and leave other rows untouched', () => {
      patchManageCaches(
        qc,
        { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN },
        {
          kind: 'listed',
          priceCredits: 5,
          tradeId: 'trade-1'
        }
      )
      const grid = qc.getQueryData<InfiniteData<MyAssetsPage>>([
        'my-assets',
        ADDRESS,
        'wearables',
        'all',
        [],
        null,
        '',
        'newest'
      ])
      const rows = grid!.pages[0].items
      expect(rows.find(r => r.tokenId === TOKEN)).toMatchObject({ isOnSale: true, listingPrice: 5 })
      expect(rows.find(r => r.tokenId === '7')).toMatchObject({ isOnSale: false, listingPrice: undefined })
    })

    it('should add the token to the shop-feed secondary sale map at the new price', () => {
      patchManageCaches(
        qc,
        { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN },
        {
          kind: 'listed',
          priceCredits: 5,
          tradeId: 'trade-1'
        }
      )
      const map = qc.getQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]])
      expect(map![KEY]).toEqual({ priceCredits: 5, tradeId: 'trade-1' })
    })

    it('writes the entry under the exact key the My Assets owned card reads it back by', () => {
      // Regression guard for the "listed from the PDP still shows NOT FOR SALE in My Assets" bug: the
      // owned card resolves its credit price from the secondary-sale-state map via
      //   saleForToken(a) = secondarySale[`${a.contractAddress}-${a.tokenId}`]
      // and assetToItem then reads `sale.priceCredits`. Replicate that lookup verbatim so the test breaks
      // if patchManageCaches ever writes a key shape (or value shape) the card can't read.
      patchManageCaches(
        qc,
        { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN },
        {
          kind: 'listed',
          priceCredits: 5,
          tradeId: 'trade-1'
        }
      )
      const map = qc.getQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]])!
      const row = asset() // an owned row for the same contract + token
      const sale = map[`${row.contractAddress}-${row.tokenId}`]
      expect(sale).toEqual({ priceCredits: 5, tradeId: 'trade-1' })
      // The card shows the price only when priceCredits > 0 (else the "NOT FOR SALE" tag).
      expect(sale.priceCredits).toBeGreaterThan(0)
    })
  })

  describe('when a token is removed from sale', () => {
    beforeEach(() => {
      // Start from an on-sale state in every cache.
      qc.setQueryData<MyAsset | null>(
        ['owned-token', CONTRACT, TOKEN, ADDRESS],
        asset({ isOnSale: true, listingPrice: 5, tradeId: 'trade-1' })
      )
      qc.setQueryData<InfiniteData<MyAssetsPage>>(['my-assets', ADDRESS, 'wearables', 'all', [], null, '', 'newest'], {
        pages: [{ items: [asset({ isOnSale: true, listingPrice: 5, tradeId: 'trade-1' })], total: 1 }],
        pageParams: [0]
      })
      qc.setQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]], {
        [KEY]: { priceCredits: 5, tradeId: 'trade-1' }
      })
    })

    it('should flip the owned-token detail cache to not-for-sale with no price or trade id', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'removed' })
      const detail = qc.getQueryData<MyAsset | null>(['owned-token', CONTRACT, TOKEN, ADDRESS])
      expect(detail).toMatchObject({ isOnSale: false, listingPrice: undefined, tradeId: undefined })
    })

    it('should drop the token from the shop-feed secondary sale map', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'removed' })
      const map = qc.getQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]])
      expect(map![KEY]).toBeUndefined()
    })

    it('should clear the on-sale flag and price on the My Assets grid row', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'removed' })
      const grid = qc.getQueryData<InfiniteData<MyAssetsPage>>([
        'my-assets',
        ADDRESS,
        'wearables',
        'all',
        [],
        null,
        '',
        'newest'
      ])
      expect(grid!.pages[0].items[0]).toMatchObject({ isOnSale: false, listingPrice: undefined })
    })
  })

  describe('when a token is gone (transferred out of the wallet)', () => {
    beforeEach(() => {
      // Start owned + on-sale across every cache, plus a second row that must survive the delete.
      qc.setQueryData<MyAsset | null>(
        ['owned-token', CONTRACT, TOKEN, ADDRESS],
        asset({ isOnSale: true, listingPrice: 5, tradeId: 'trade-1' })
      )
      qc.setQueryData<InfiniteData<MyAssetsPage>>(['my-assets', ADDRESS, 'wearables', 'all', [], null, '', 'newest'], {
        pages: [
          {
            items: [
              asset({ id: 'other', tokenId: '7' }),
              asset({ isOnSale: true, listingPrice: 5, tradeId: 'trade-1' })
            ],
            total: 2
          }
        ],
        pageParams: [0]
      })
      qc.setQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]], {
        [KEY]: { priceCredits: 5, tradeId: 'trade-1' }
      })
    })

    it('should null the owned-token detail cache so the PDP drops the manage view', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'gone' })
      const detail = qc.getQueryData<MyAsset | null>(['owned-token', CONTRACT, TOKEN, ADDRESS])
      expect(detail).toBeNull()
    })

    it('should delete the matching row from the My Assets grid, decrement the total, and keep other rows', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'gone' })
      const grid = qc.getQueryData<InfiniteData<MyAssetsPage>>([
        'my-assets',
        ADDRESS,
        'wearables',
        'all',
        [],
        null,
        '',
        'newest'
      ])
      const page = grid!.pages[0]
      expect(page.items.find(r => r.tokenId === TOKEN)).toBeUndefined()
      expect(page.items.find(r => r.tokenId === '7')).toBeDefined()
      expect(page.items).toHaveLength(1)
      expect(page.total).toBe(1)
    })

    it('should drop the token from the shop-feed secondary sale map', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: TOKEN }, { kind: 'gone' })
      const map = qc.getQueryData<SecondarySaleMap>(['secondary-sale-state', [CONTRACT]])
      expect(map![KEY]).toBeUndefined()
    })
  })

  describe('when the target has no token id', () => {
    it('should not touch any cache', () => {
      patchManageCaches(qc, { address: ADDRESS, contractAddress: CONTRACT, tokenId: undefined }, { kind: 'removed' })
      const detail = qc.getQueryData<MyAsset | null>(['owned-token', CONTRACT, TOKEN, ADDRESS])
      expect(detail).toMatchObject({ isOnSale: false })
    })
  })
})
