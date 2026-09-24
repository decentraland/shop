import { COLLECTION, TEST_ADDRESS } from './fixtures'

/**
 * One store built to light up every figure the dashboard can draw, at once.
 *
 * The other fixtures each answer one question. This answers "does the page hold together when all of it
 * has something to say", which is the state a creator with a real store is actually in and the one no
 * single-purpose fixture reaches. It is also what the page is demonstrated from, so it is kept honest:
 * every number here is derived by the same code paths production uses, not written in by hand.
 *
 * What it deliberately cannot show is "Nothing is selling". That row needs a store that sold nothing at
 * all, which is the opposite of everything else here.
 */
const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = Date.now()

/** A second and third collection, so the list has something to sort and something to set back. */
const SOLD_OUT_COLLECTION = '0xc0113c1100000000000000000000000000000002'
const QUIET_COLLECTION = '0xc0113c1100000000000000000000000000000003'

/** Four buyers, one of whom is most of the store: enough for the concentration line to fire. */
const BUYERS = [
  '0xaca5bc79b0cd51b726d2eadfc747f7ad4dfe7efb',
  '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
  '0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2',
  '0xd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3'
]

const item = (
  contract: string,
  collectionId: string,
  itemId: number,
  name: string,
  minted: number,
  rarity = 'epic'
) => ({
  id: `${collectionId}-${itemId}`,
  collection_id: collectionId,
  contract_address: contract,
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

const listing = (contract: string, itemId: string, name: string, priceCredits: number) => ({
  tradeId: `trade-${contract}-${itemId}`,
  listingType: 'primary',
  contractAddress: contract,
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

const sale = (
  n: number,
  contract: string,
  itemId: string,
  hoursAgo: number,
  price: string,
  buyer: string,
  type = 'mint'
) => ({
  id: `show-${n}`,
  itemId,
  contractAddress: contract,
  buyer,
  seller: TEST_ADDRESS,
  price,
  timestamp: NOW - hoursAgo * HOUR,
  type,
  network: 'MATIC',
  chainId: 80002,
  txHash: `0x${n.toString(16).padStart(64, '0')}`
})

/**
 * `epic` caps at 1000, so an item is sold out only when its minted count reaches that cap. The sold-out
 * collection uses `unique`, whose cap is 1, which is the cheapest way to say "there is nothing left".
 */
const catalogue = [
  item(COLLECTION, 'col-neon', 0, 'Neon Runner Boots', 340),
  item(COLLECTION, 'col-neon', 1, 'Neon Runner Jacket', 210),
  item(COLLECTION, 'col-neon', 2, 'Neon Runner Visor', 95),
  item(SOLD_OUT_COLLECTION, 'col-founders', 0, 'Founders Cloak', 1, 'unique'),
  item(SOLD_OUT_COLLECTION, 'col-founders', 1, 'Founders Crown', 1, 'unique'),
  item(QUIET_COLLECTION, 'col-winter', 0, 'Winter Capsule Scarf', 0),
  item(QUIET_COLLECTION, 'col-winter', 1, 'Winter Capsule Mittens', 0),
  item(QUIET_COLLECTION, 'col-winter', 2, 'Winter Capsule Parka', 0)
]

/** The winter capsule is published and never listed, so its collection row reports nothing listed. */
const listed = [
  listing(COLLECTION, '0', 'Neon Runner Boots', 30),
  listing(COLLECTION, '1', 'Neon Runner Jacket', 45),
  listing(COLLECTION, '2', 'Neon Runner Visor', 20)
]

/** Nine sales inside the two days the Neon Runners discount has been live, against four in the two before. */
const during = Array.from({ length: 9 }, (_, i) =>
  sale(i + 1, COLLECTION, String(i % 3), 4 + i * 4, '5000000000000000000', BUYERS[[0, 0, 0, 0, 0, 1, 1, 2, 3][i]])
)
const before = Array.from({ length: 4 }, (_, i) =>
  sale(20 + i, COLLECTION, String(i % 3), 52 + i * 8, '5000000000000000000', BUYERS[i % 2])
)
/**
 * The rest of the month, which is what makes the discount's reading trustworthy rather than absent.
 *
 * `saleLift` refuses to answer when the stretch it would compare against falls outside the rows it was
 * given, since every sale that was never fetched would read as a sale that never happened. Without a
 * month behind it, a two-day discount has nothing to be measured against.
 */
const background = Array.from({ length: 8 }, (_, i) =>
  sale(
    30 + i,
    COLLECTION,
    String(i % 3),
    (5 + i * 2.5) * 24,
    '4600000000000000000',
    BUYERS[[0, 0, 0, 0, 0, 1, 2, 3][i]]
  )
)
/** Older than the window, inside the one before it, so every figure has a month to be compared against. */
const earlier = Array.from({ length: 6 }, (_, i) =>
  sale(40 + i, COLLECTION, String(i % 3), (34 + i * 2) * 24, '4000000000000000000', BUYERS[i % 3])
)

/**
 * Copies changing hands between collectors, which is what the royalties figure is made of and what the
 * KIND column exists to tell apart from a first sale.
 */
const resales = [
  sale(60, COLLECTION, '0', 30, '18000000000000000000', BUYERS[2], 'order'),
  sale(61, COLLECTION, '1', 96, '24000000000000000000', BUYERS[3], 'order'),
  sale(62, SOLD_OUT_COLLECTION, '0', 200, '140000000000000000000', BUYERS[1], 'order')
]

const sales = [...during, ...before, ...background, ...resales, ...earlier]

const coupon = (
  id: string,
  collection: string,
  discount: number,
  startedAgo: number,
  endsIn: number,
  uses: number,
  used: number
) => ({
  id,
  signer: TEST_ADDRESS,
  chainId: 80002,
  network: 'MATIC',
  checks: {
    uses,
    expiration: NOW + endsIn,
    effective: NOW - startedAgo,
    salt: `0x${id.length.toString(16).padStart(2, '0').repeat(32)}`,
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    externalChecks: [],
    allowedProof: []
  },
  couponManager: '0x6c956587d9fe70032781edcdc626310648575382',
  couponAddress: '0x4ee8f6b87f4917a3bbc7c8bb3a06db8555f83db9',
  discountType: 1,
  discount,
  root: `0x${'44'.repeat(32)}`,
  collections: [collection],
  signature: `0x${'cd'.repeat(65)}`,
  createdAt: NOW - startedAgo,
  state: { uses: used, cancelled: false, revoked: false, checkedAt: NOW },
  status: 'active'
})

/**
 * Three at once, on purpose, and each with a different story.
 *
 * The one on the collection that sells reports faster; the one on the capsule nobody buys has nothing to
 * show for itself; the one on a collection with no copies left is the mistake a creator can actually make.
 * Measured per collection, which is the only way the three can differ.
 */
const runningSales = [
  coupon('coupon-neon', COLLECTION, 250_000, 2 * DAY, 3 * DAY, 50, 9),
  coupon('coupon-winter', QUIET_COLLECTION, 400_000, 3 * DAY, 4 * DAY, 20, 0),
  coupon('coupon-founders', SOLD_OUT_COLLECTION, 150_000, 6 * HOUR, 5 * DAY, 10, 0)
]

/** The items are served per collection, so the list of collections is what the page walks first. */
const collections = [
  { id: 'col-neon', name: 'Neon Runners', contract: COLLECTION },
  { id: 'col-founders', name: 'Founders Edition', contract: SOLD_OUT_COLLECTION },
  { id: 'col-winter', name: 'Winter Capsule', contract: QUIET_COLLECTION }
].map(c => ({
  id: c.id,
  name: c.name,
  eth_address: TEST_ADDRESS,
  contract_address: c.contract,
  is_published: true,
  is_approved: true,
  minters: []
}))

export const storeShowcaseFixtures = {
  builderCollections: { data: collections },
  importable: { data: [] },
  unifiedListings: { data: [] },
  shopListings: { data: listed },
  builderItems: { data: catalogue },
  collectionSaleState: { data: listed, total: listed.length },
  coupons: { data: runningSales },
  sales: { data: sales, total: sales.length }
}
