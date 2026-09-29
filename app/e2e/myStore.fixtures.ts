import { COLLECTION, TEST_ADDRESS } from './fixtures'

// The store the My Store specs read, in its own module: importing it from a spec file would run that
// spec's suites a second time inside whichever file imported it.

export const DAY = 86_400_000
export const HOUR = 3_600_000

// The creator's catalogue, as the builder serves it. `total_supply` against the rarity's cap is what says
// how much of a run is left — Galaxy Crown is a unique with its one copy minted, so it is sold out.
export const builderItem = (itemId: number, name: string, minted: number, rarity = 'epic') => ({
  id: `item-${itemId}`,
  collection_id: 'col-1',
  contract_address: COLLECTION,
  blockchain_item_id: String(itemId),
  name,
  thumbnail: 'thumbnail.png',
  contents: { 'thumbnail.png': 'bafyfake' },
  is_published: true,
  is_approved: true,
  total_supply: minted,
  rarity,
  type: 'wearable',
  data: { wearable: { category: 'hat' } }
})

export const listing = (itemId: string, name: string, priceCredits: number) => ({
  tradeId: `trade-${itemId}`,
  listingType: 'primary',
  contractAddress: COLLECTION,
  itemId,
  tokenId: null,
  name,
  thumbnail: '',
  rarity: 'epic',
  category: 'wearable',
  wearableCategory: 'hat',
  creator: TEST_ADDRESS,
  priceCredits,
  available: 10,
  network: 'MATIC',
  chainId: 80002
})

/** Four buyers, one of whom takes most of the store: enough for the collectors figures to mean something. */
export const BUYERS = [
  '0xaca5bc79b0cd51b726d2eadfc747f7ad4dfe7efb',
  '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
  '0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2',
  '0xd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3'
]

export const sale = (n: number, itemId: string, daysAgo: number, price: string, type = 'mint', buyer = BUYERS[0]) => ({
  id: `sale-${n}`,
  itemId,
  contractAddress: COLLECTION,
  buyer,
  seller: TEST_ADDRESS,
  price,
  timestamp: Date.now() - daysAgo * DAY,
  type,
  network: 'MATIC',
  tokenId: null,
  chainId: 80002
})

export const runningSale = {
  id: 'coupon-live',
  signer: TEST_ADDRESS,
  chainId: 80002,
  network: 'MATIC',
  checks: {
    uses: 5,
    expiration: Date.now() + 40 * HOUR,
    // Live for two days, with sales on either side of that line: long enough for the panel to say whether
    // it moved anything, which an hour-old discount cannot.
    effective: Date.now() - 2 * DAY,
    salt: '0x' + '22'.repeat(32),
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    externalChecks: [],
    allowedProof: []
  },
  couponManager: '0x6c956587d9fe70032781edcdc626310648575382',
  couponAddress: '0x4ee8f6b87f4917a3bbc7c8bb3a06db8555f83db9',
  discountType: 1,
  discount: 300_000,
  root: '0x' + '11'.repeat(32),
  collections: [COLLECTION],
  signature: '0x' + 'ab'.repeat(65),
  createdAt: Date.now() - HOUR,
  state: { uses: 0, cancelled: false, revoked: false, checkedAt: Date.now() },
  status: 'active'
}

// Four items, three of which have sold: 4 first sales of the hat, 10 of the boots, one RESALE of the cape.
// Fifteen in all, which is more than one page of the table — the pager only exists past that.
export const sales = [
  sale(1, '0', 0, '5000000000000000000'),
  sale(2, '0', 1, '5000000000000000000'),
  sale(3, '0', 3, '5000000000000000000'),
  sale(4, '1', 2, '370908000000000000'),
  sale(5, '1', 5, '370908000000000000'),
  sale(6, '1', 9, '370908000000000000'),
  sale(7, '2', 12, '8160000000000000000', 'order', BUYERS[1]),
  sale(8, '0', 15, '5000000000000000000', 'mint', BUYERS[1]),
  ...Array.from({ length: 7 }, (_, i) =>
    sale(9 + i, '1', 4 + i, '370908000000000000', 'mint', BUYERS[[0, 0, 0, 1, 1, 2, 3][i]])
  ),
  // Older than the 30-day window and inside the one before it, so the period-over-period figures have a
  // month to compare against instead of reading every store as brand new.
  ...Array.from({ length: 6 }, (_, i) => sale(20 + i, '0', 35 + i * 2, '5000000000000000000'))
]

export const listed = [listing('0', 'Galaxy Hat', 30), listing('1', 'Galaxy Boots', 10)]

export const storeFixtures = {
  importable: { data: [] },
  unifiedListings: { data: [] },
  shopListings: { data: listed },
  builderItems: {
    data: [
      builderItem(0, 'Galaxy Hat', 12),
      builderItem(1, 'Galaxy Boots', 40),
      builderItem(2, 'Galaxy Cape', 3),
      builderItem(3, 'Galaxy Crown', 1, 'unique')
    ]
  },
  collectionSaleState: { data: listed, total: listed.length },
  coupons: { data: [runningSale] },
  sales: { data: sales, total: sales.length }
}
