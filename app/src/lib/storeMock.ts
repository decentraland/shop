import type { SaleRow } from '~/lib/sales'
import type { StoreCollection, StoreItem, StoreStats } from '~/lib/storeStats'
import type { Buyer, Collectors } from '~/lib/storeMetrics'

/**
 * A store invented for looking at, reachable at `/my-store?mock=1`.
 *
 * Off on production and on staging, on every other deployment — see `previewHost` in src/config for why
 * that check is a runtime one.
 *
 * It exists because the states this page has to get right are the ones no real store shows at once. A
 * creator either has a discount running or does not; a real account cannot be sold out, discounted, quiet
 * and thriving on the same screen. Judging the layout means seeing all of them together, and waiting for
 * production to produce that combination is not a plan.
 */
const DAY = 86_400_000
const NOW = Date.now()

const item = (n: number, name: string, minted: number, cap: number, state: StoreItem['state']): StoreItem => ({
  key: `0xmock${n}-${n}`,
  itemId: String(n),
  name,
  thumbnail: '',
  rarity: ['epic', 'legendary', 'rare', 'mythic', 'unique'][n % 5],
  left: cap - minted,
  minted,
  sold: Math.round(minted / 6),
  earnedWei: BigInt(Math.round(minted / 6) * (3 + (n % 5))) * 10n ** 18n,
  lifetimeSold: minted,
  priceCredits: state === 'classic' ? null : 20 + n * 5,
  manaWei: state === 'classic' ? '5000000000000000000' : null,
  createdAt: NOW - n * 11 * DAY,
  state
})

/** A rising trend, a spiky one, a fading one and a flat one, so every shape the chart can draw is on screen. */
const TRENDS: number[][] = [
  [0, 1, 1, 2, 3, 3, 5, 6, 8, 9, 11, 13, 16, 21],
  [2, 9, 1, 0, 7, 2, 11, 1, 0, 6, 14, 2, 8, 3],
  [18, 16, 14, 11, 9, 8, 6, 5, 3, 2, 2, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
]

type MockCollection = {
  name: string
  items: [string, number, number, StoreItem['state']][]
  trend: number
  earnings: number
  sold: number
}

const COLLECTIONS: MockCollection[] = [
  {
    name: 'Neon Runners',
    items: [
      ['Neon Runner Boots', 340, 1000, 'discounted'],
      ['Neon Runner Jacket', 210, 1000, 'discounted'],
      ['Neon Runner Visor', 95, 1000, 'discounted']
    ],
    trend: 0,
    earnings: 1840,
    sold: 128
  },
  {
    name: 'Founders Edition',
    items: [
      ['Founders Cloak', 1, 1, 'soldout'],
      ['Founders Crown', 1, 1, 'soldout']
    ],
    trend: 3,
    earnings: 0,
    sold: 0
  },
  {
    name: 'Midnight Capsule',
    items: [
      ['Midnight Scarf', 0, 500, 'unlisted'],
      ['Midnight Mittens', 0, 500, 'unlisted'],
      ['Midnight Parka', 0, 500, 'unlisted']
    ],
    trend: 3,
    earnings: 0,
    sold: 0
  },
  {
    name: 'Classic Collection',
    items: [
      ['Classic Tee', 60, 200, 'classic'],
      ['Classic Cap', 44, 200, 'classic']
    ],
    trend: 2,
    earnings: 310,
    sold: 12
  },
  {
    name: 'Summer Drop',
    items: [
      ['Summer Shades', 480, 1000, 'discounted'],
      ['Summer Sandals', 300, 1000, 'discounted']
    ],
    trend: 1,
    earnings: 920,
    sold: 71
  },
  {
    name: 'Studio Basics',
    items: [['Studio Hoodie', 12, 100, 'unknown']],
    trend: 3,
    earnings: 0,
    sold: 0
  }
]

function collection(spec: MockCollection, index: number): StoreCollection {
  const items = spec.items.map(([name, minted, cap, state], i) => item(index * 10 + i, name, minted, cap, state))
  const claimed = items.reduce((n, i) => n + i.minted, 0)
  return {
    contractAddress: `0xmock${index.toString().padStart(36, '0')}`,
    collectionId: `mock-${index}`,
    name: spec.name,
    items,
    listed: items.filter(i => i.state === 'discounted').length,
    classic: items.filter(i => i.state === 'classic').length,
    soldOut: items.filter(i => i.state === 'soldout').length,
    sold: spec.sold,
    earningsWei: BigInt(spec.earnings) * 10n ** 18n,
    createdAt: NOW - index * 30 * DAY,
    trend: TRENDS[spec.trend],
    claimed,
    runTotal: items.reduce((n, i) => n + i.minted + i.left, 0),
    exhausted: items.length > 0 && items.every(i => i.state === 'soldout')
  }
}

export const mockStats: StoreStats = (() => {
  const collections = COLLECTIONS.map(collection)
  return {
    collections,
    sold: 211,
    mints: 198,
    resales: 13,
    earningsWei: 3070n * 10n ** 18n,
    partial: false,
    breakdownPartial: false,
    fetched: 211,
    unattributed: 6,
    trendDays: 30,
    unknownCollections: 1,
    royalties: { resales: 41, volumeWei: 2140n * 10n ** 18n },
    listed: collections.reduce((n, c) => n + c.listed, 0),
    neverListed: collections.reduce((n, c) => n + c.items.filter(i => i.state === 'unlisted').length, 0),
    classic: collections.reduce((n, c) => n + c.classic, 0),
    soldOut: collections.reduce((n, c) => n + c.soldOut, 0)
  }
})()

export const mockCollectors: Collectors = {
  total: 74,
  repeat: 29,
  repeatPct: 39.19,
  topSharePct: 21.3,
  top: []
}

export const mockBuyers: Buyer[] = Array.from({ length: 12 }, (_, i) => ({
  address: `0x${(i + 1).toString(16).repeat(40).slice(0, 40)}`,
  bought: 12 - i,
  items: Math.max(1, 8 - i),
  collections: Math.max(1, 5 - Math.floor(i / 2)),
  spentWei: BigInt(900 - i * 62) * 10n ** 18n,
  lastAt: NOW - (i + 1) * 9 * 3_600_000
}))

/**
 * Two discounts, on the two collections whose rows read differently because of them: one on the store's
 * best seller and one on a collection with nothing left, which is the mistake the page should make visible.
 *
 * Whole sales rather than a contract-to-percentage map, so the table and the discounts panel read the same
 * source. They used to be fed separately, and the panel announced that nothing was running while two rows
 * above it wore a discount chip.
 */
const sale = (n: number, contract: string, discount: number, startedAgo: number, endsIn: number, used: number) => ({
  id: `mock-coupon-${n}`,
  signer: '0xmockcreator0000000000000000000000000001',
  chainId: 137,
  network: 'MATIC',
  checks: {
    uses: 50,
    expiration: NOW + endsIn,
    effective: NOW - startedAgo,
    salt: `0x${n.toString().repeat(64).slice(0, 64)}`,
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    externalChecks: [],
    allowedProof: []
  },
  couponManager: '0x6c956587d9fe70032781edcdc626310648575382',
  couponAddress: '0x4ee8f6b87f4917a3bbc7c8bb3a06db8555f83db9',
  discountType: 1,
  discount: discount * 10_000,
  root: `0x${'44'.repeat(32)}`,
  collections: [contract],
  signature: `0x${'cd'.repeat(65)}`,
  proof: [],
  createdAt: NOW - startedAgo,
  state: { uses: used, cancelled: false, revoked: false, checkedAt: NOW },
  status: 'active' as const
})

export const mockSales = [
  sale(1, `0xmock${'0'.repeat(36)}`, 25, 3 * DAY, 3 * DAY, 18),
  sale(2, `0xmock${'1'.padStart(36, '0')}`, 15, 12 * 3_600_000, 9 * DAY, 0)
]

/** Saves per item, so the column beside "sold" has the pair that makes it a reading rather than a number. */
export const mockSaves = new Map<string, number>(
  mockStats.collections.flatMap(c =>
    c.items.map((item, i) => [item.key, [41, 3, 128, 0, 17, 6, 92, 1][i % 8]] as [string, number])
  )
)

/**
 * A page of sales for the recent-sales table, which otherwise reads empty here: the invented store has no
 * address, so the feed it is paged from has nothing to answer with.
 *
 * Mixed on purpose — first sales and resales, named buyers and bare addresses, minutes ago and days ago —
 * because those are the rows whose kind chip, face fallback and relative date the table has to get right.
 */
const SALE_ITEMS = mockStats.collections.flatMap(c => c.items.map(item => [c.contractAddress, item] as const))

export const mockSaleRows: SaleRow[] = SALE_ITEMS.slice(0, 5).map(([contractAddress, item], i) => ({
  id: `mock-sale-${i}`,
  itemId: i === 3 ? null : item.itemId,
  contractAddress,
  buyer: `0x${(i + 3).toString(16).repeat(40).slice(0, 40)}`,
  seller: '0xmockcreator0000000000000000000000000001',
  price: String(BigInt(40 + i * 17) * 10n ** 18n),
  timestamp: NOW - (i === 0 ? 8 * 60_000 : i * 19 * 3_600_000),
  type: i === 3 ? 'order' : 'mint',
  network: 'MATIC',
  tokenId: i === 3 ? '1042' : null
}))

/**
 * Two years of sales for the chart, with a season in them: a summer lull and a spike each autumn, so the
 * comparison against last year has a shape to show. Deterministic, so a screenshot is the same every time.
 */
export const mockChartRows: SaleRow[] = (() => {
  const rows: SaleRow[] = []
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let day = 0; day < 730; day++) {
    const at = NOW - day * DAY
    const month = new Date(at).getMonth()
    const season = month >= 5 && month <= 7 ? 0.4 : month >= 8 && month <= 10 ? 1.8 : 1
    const count = Math.round(random() * 4 * season)
    for (let n = 0; n < count; n++) {
      const [contractAddress, item] = SALE_ITEMS[Math.floor(random() * SALE_ITEMS.length)]
      rows.push({
        id: `mock-chart-${day}-${n}`,
        itemId: item.itemId,
        contractAddress,
        buyer: `0x${Math.floor(random() * 0xffffff)
          .toString(16)
          .padStart(40, '0')}`,
        seller: '0xmockcreator0000000000000000000000000001',
        price: String(BigInt(5 + Math.floor(random() * 60)) * 10n ** 18n),
        timestamp: at - Math.floor(random() * DAY),
        type: 'mint',
        network: 'MATIC',
        tokenId: null
      })
    }
  }
  return rows
})()
