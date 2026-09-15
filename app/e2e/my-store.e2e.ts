import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, TEST_ADDRESS } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const DAY = 86_400_000
const HOUR = 3_600_000

// The creator's catalogue, as the builder serves it. `total_supply` against the rarity's cap is what says
// how much of a run is left — Galaxy Crown is a unique with its one copy minted, so it is sold out.
const builderItem = (itemId: number, name: string, minted: number, rarity = 'epic') => ({
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

const listing = (itemId: string, name: string, priceCredits: number) => ({
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

const sale = (n: number, itemId: string, daysAgo: number, price: string, type = 'mint') => ({
  id: `sale-${n}`,
  itemId,
  contractAddress: COLLECTION,
  buyer: '0xaca5bc79b0cd51b726d2eadfc747f7ad4dfe7efb',
  seller: TEST_ADDRESS,
  price,
  timestamp: Date.now() - daysAgo * DAY,
  type,
  network: 'MATIC',
  tokenId: null,
  chainId: 80002
})

const runningSale = {
  id: 'coupon-live',
  signer: TEST_ADDRESS,
  chainId: 80002,
  network: 'MATIC',
  checks: {
    uses: 5,
    expiration: Date.now() + 40 * HOUR,
    effective: Date.now() - HOUR,
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

// Four items, three of which have sold: 4 mints of the hat, 3 of the boots, one RESALE of the cape.
const sales = [
  sale(1, '0', 0, '5000000000000000000'),
  sale(2, '0', 1, '5000000000000000000'),
  sale(3, '0', 3, '5000000000000000000'),
  sale(4, '1', 2, '370908000000000000'),
  sale(5, '1', 5, '370908000000000000'),
  sale(6, '1', 9, '370908000000000000'),
  sale(7, '2', 12, '8160000000000000000', 'order'),
  sale(8, '0', 15, '5000000000000000000')
]

const listed = [listing('0', 'Galaxy Hat', 30), listing('1', 'Galaxy Boots', 10)]

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

const text = (app: App, testId: string) =>
  app.page.$eval(`[data-testid="${testId}"]`, el => (el as HTMLElement).innerText.trim())

describe('when a creator opens their store', () => {
  it('should summarise the period, name what needs attention, and open a collection to its items', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 1440, height: 1200 })
    await waitForText(page, 'My Store')
    await page.waitForSelector('[data-testid="store-collection"]')

    // The window's figures, from the one sales fetch the page makes.
    expect(await text(app, 'store-sold')).toBe('8')
    expect(await text(app, 'store-discounts')).toBe('1')
    const body = await bodyText(page)
    expect(body).toContain('7 first sales · 1 resale')

    // Only what the creator can act on: nothing is priced in MANA here, so that row is absent rather than
    // sitting at zero.
    expect(await page.$('[data-testid="store-attn-classic"]')).toBeNull()
    expect(await text(app, 'store-attn-soldout')).toBe('1')
    expect(await text(app, 'store-attn-unlisted')).toBe('1')

    // The collection wears the discount that is running on it.
    expect(await text(app, 'store-collection-name')).toBe('Galaxy Drip')
    expect(body).toContain('-30%')

    // The breakdown is closed until the chevron opens it.
    expect(await page.$('[data-testid="store-items"]')).toBeNull()
    await page.click('[data-testid="store-collection-toggle"]')
    await page.waitForSelector('[data-testid="store-items"]')
    expect(await page.$eval('[data-testid="store-collection-toggle"]', el => el.getAttribute('aria-expanded'))).toBe(
      'true'
    )

    const items = await page.$$eval('[data-testid="store-item"]', rows =>
      rows.map(row => (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
    )
    expect(items).toHaveLength(4)
    // Best-selling first, each with its own count and what is left of its run.
    expect(items[0]).toMatch(/^Galaxy Hat 4 sold/)
    expect(items[0]).toMatch(/988 LEFT/i)
    expect(items[1]).toMatch(/^Galaxy Boots 3 sold/)
    expect(items[2]).toMatch(/^Galaxy Cape 1 sold/)
    expect(items[2]).toMatch(/NOT LISTED/i)
    expect(items[3]).toMatch(/^Galaxy Crown 0 sold/)
    expect(items[3]).toMatch(/SOLD OUT/i)

    // And it closes again.
    await page.click('[data-testid="store-collection-toggle"]')
    await page.waitForFunction(() => !document.querySelector('[data-testid="store-items"]'))
  })

  it('should fit a phone without scrolling sideways', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })
    await page.waitForSelector('[data-testid="store-collection"]')
    await page.click('[data-testid="store-collection-toggle"]')
    await page.waitForSelector('[data-testid="store-item"]')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
})

describe('when the store dashboard is switched off', () => {
  it('should not offer the nav entry', async () => {
    app = await launchApp({ path: '/', fixtures: storeFixtures })
    await waitForText(app.page, 'Collectibles')

    expect(await app.page.$('[data-testid="nav-my-store"]')).toBeNull()
  })

  it('should close the page itself, not just hide the way in', async () => {
    app = await launchApp({ path: '/my-store', fixtures: storeFixtures })
    await app.page.waitForFunction(() => location.pathname !== '/my-store')

    expect(await app.page.evaluate(() => location.pathname)).toBe('/overview')
  })

  it('and it is on it should lead a creator to it', async () => {
    app = await launchApp({ path: '/', myStore: true, fixtures: storeFixtures })
    await app.page.waitForSelector('[data-testid="nav-my-store"]')

    await Promise.all([
      app.page.waitForFunction(() => location.pathname === '/my-store'),
      app.page.click('[data-testid="nav-my-store"]')
    ])
    await waitForText(app.page, 'My Store')
  })
})
