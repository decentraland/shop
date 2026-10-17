import { describe, expect, it } from 'vitest'
import type { PublishableItem } from '~/lib/builder'
import type { CollectionSaleState } from '~/lib/collections'
import { isDiscountableManaListing, toSaleableCollections } from '~/lib/saleableCollections'

// Polygon mainnet: a new sale is signed against the manager of the marketplace the Shop lists on (V3). V2 pairs
// with a different manager, so a coupon signed today cannot redeem against a trade signed for it.
const POLYGON = 137
const MARKETPLACE_V3 = '0xe38ef22abe871513555cba89adfe45ab4f548ada'
const MARKETPLACE_V2 = '0xa40b1d129b8906888720686f3a01921ddf37716f'
const COLLECTION = '0xcollection'

const item = (id: string): PublishableItem => ({
  id,
  collectionId: 'c1',
  collectionName: 'Spooky',
  contractAddress: COLLECTION,
  blockchainItemId: id,
  name: `Item ${id}`,
  category: 'hat',
  rarity: 'rare',
  thumbnail: '',
  type: 'wearable',
  isPublished: true,
  isApproved: true,
  totalSupply: 1,
  maxSupply: 100,
  remainingSupply: 99,
  minters: []
})

const credits: CollectionSaleState = { isOnSale: true, priceCredits: 50, tradeId: 't-credits' }
const manaTrade = (contract: string): CollectionSaleState => ({
  isOnSale: true,
  priceCredits: 40,
  manaWei: '400000000000000000000',
  manaTradeContract: contract
})
const storePrice: CollectionSaleState = { isOnSale: true, priceCredits: 30, manaWei: '300000000000000000000' }

const states = (byItem: Record<string, CollectionSaleState>) =>
  Object.fromEntries(Object.entries(byItem).map(([id, sale]) => [`${COLLECTION}-${id}`, sale]))

const stateOf = (sale: CollectionSaleState, manaListings: boolean) =>
  toSaleableCollections([item('0')], states({ '0': sale }), { manaListings, chainId: POLYGON })[0]?.items[0].state

describe('when deciding which of a creator listings a new discount can reach', () => {
  it('should let a Credits listing take the discount whatever the flag', () => {
    expect(stateOf(credits, false)).toBe('discounted')
    expect(stateOf(credits, true)).toBe('discounted')
  })

  describe('and the listing is a MANA trade on the marketplace the sale is signed for', () => {
    it('should take the discount while MANA listings are discounted for buyers', () => {
      expect(stateOf(manaTrade(MARKETPLACE_V3), true)).toBe('discounted')
    })

    // Off, buyers would not see the cut: offering it to the creator would promise a sale nobody gets.
    it('should stay classic while they are not', () => {
      expect(stateOf(manaTrade(MARKETPLACE_V3), false)).toBe('classic')
    })

    it('should count it as listed, with its price for the example line', () => {
      const [collection] = toSaleableCollections([item('0')], states({ '0': manaTrade(MARKETPLACE_V3) }), {
        manaListings: true,
        chainId: POLYGON
      })

      expect(collection).toMatchObject({ listedCount: 1, examplePriceCredits: 40 })
    })
  })

  it('should keep a MANA trade on a marketplace that redeems through another manager classic', () => {
    expect(stateOf(manaTrade(MARKETPLACE_V2), true)).toBe('classic')
  })

  // A collection-store price lives on the collection and is bought through CollectionStore.buy, which takes
  // no coupon, so no flag can make it discountable.
  it('should keep a collection-store price classic', () => {
    expect(stateOf(storePrice, true)).toBe('classic')
    expect(isDiscountableManaListing(storePrice, POLYGON)).toBe(false)
  })

  it('should not call a MANA trade discountable on a chain with no coupon deployment', () => {
    expect(isDiscountableManaListing(manaTrade(MARKETPLACE_V3), 999_999)).toBe(false)
  })

  it('should mark the MANA items it discounts, so the flow can count them', () => {
    const [collection] = toSaleableCollections(
      [item('0'), item('1')],
      states({ '0': manaTrade(MARKETPLACE_V3), '1': credits }),
      {
        manaListings: true,
        chainId: POLYGON
      }
    )

    expect(collection.items.map(i => !!i.mana)).toEqual([true, false])
  })

  it('should block a collection only when nothing in it can take the discount', () => {
    const offer = (manaListings: boolean) =>
      toSaleableCollections([item('0'), item('1')], states({ '0': manaTrade(MARKETPLACE_V3), '1': storePrice }), {
        manaListings,
        chainId: POLYGON
      })[0]

    expect(offer(true).listedCount).toBe(1)
    expect(offer(false).listedCount).toBe(0)
    // Still offered either way: the modal explains what to change instead of hiding the collection.
    expect(offer(false).items.map(i => i.state)).toEqual(['classic', 'classic'])
  })
})
