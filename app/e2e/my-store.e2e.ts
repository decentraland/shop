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

// Four items, three of which have sold: 4 first sales of the hat, 10 of the boots, one RESALE of the cape.
// Fifteen in all, which is more than one page of the table — the pager only exists past that.
const sales = [
  sale(1, '0', 0, '5000000000000000000'),
  sale(2, '0', 1, '5000000000000000000'),
  sale(3, '0', 3, '5000000000000000000'),
  sale(4, '1', 2, '370908000000000000'),
  sale(5, '1', 5, '370908000000000000'),
  sale(6, '1', 9, '370908000000000000'),
  sale(7, '2', 12, '8160000000000000000', 'order'),
  sale(8, '0', 15, '5000000000000000000'),
  ...Array.from({ length: 7 }, (_, i) => sale(9 + i, '1', 4 + i, '370908000000000000'))
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
    expect(await text(app, 'store-sold')).toBe('15')
    expect(await text(app, 'store-discounts')).toBe('1')
    const body = await bodyText(page)
    // Counted by the server's own aggregate, not derived from the page of rows the table happens to hold,
    // and named by who did the selling: a resale is the creator's, a royalty is somebody else's.
    expect(body).toContain('14 first sales · 1 resold by you')

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
    // Best-selling first, each with its rarity, its own count, its listing state and what is left of its run.
    expect(items[0]).toMatch(/^Galaxy Boots/)
    expect(items[0]).toMatch(/10 sold/)
    expect(items[0]).toMatch(/EPIC/i)
    // The row shows what the item asks, not merely that it is asking.
    expect(items[0]).toMatch(/ON SALE FOR/i)
    expect(items[0]).toMatch(/STOCK 960\/1,?000/i)
    expect(items[1]).toMatch(/^Galaxy Hat/)
    expect(items[1]).toMatch(/4 sold/)
    expect(items[2]).toMatch(/^Galaxy Cape/)
    expect(items[2]).toMatch(/NOT LISTED/i)
    // Stock stands whatever the listing state: an unlisted item still has a run.
    expect(items[2]).toMatch(/STOCK 997\/1,?000/i)
    expect(items[3]).toMatch(/^Galaxy Crown/)
    // The run is stated at zero too: "sold out" alone does not distinguish a 1-of-1 from a drop of a thousand.
    expect(items[3]).toMatch(/SOLD OUT 0\/1/i)

    // And it closes again.
    await page.click('[data-testid="store-collection-toggle"]')
    await page.waitForFunction(() => !document.querySelector('[data-testid="store-items"]'))
  })

  it('should page through every sale, and send each buyer to their own page', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 1440, height: 1200 })
    await page.waitForSelector('[data-testid="store-sale"]')

    // A page of the feed, not a handful kept from the aggregate: the rest is a click away.
    expect(await page.$$eval('[data-testid="store-sale"]', rows => rows.length)).toBe(12)
    const buyer = await page.$eval('[data-testid="store-sale-buyer"]', el => ({
      href: el.getAttribute('href'),
      target: el.getAttribute('target'),
      rel: el.getAttribute('rel')
    }))
    expect(buyer.href).toMatch(/\/0xaca5bc79b0cd51b726d2eadfc747f7ad4dfe7efb$/)
    expect(buyer.target).toBe('_blank')
    expect(buyer.rel).toContain('noopener')

    // The item opens its own page in its own tab, so a creator reading the feed does not lose their place.
    const saleItem = await page.$eval('[data-testid="store-sale-item"]', el => ({
      href: el.getAttribute('href'),
      target: el.getAttribute('target')
    }))
    expect(saleItem.href).toMatch(/^\/item\/0x[0-9a-f]+\/\d+$/i)
    expect(saleItem.target).toBe('_blank')

    // Numbered pages: the second one holds the remaining three sales, and the page you are on is marked.
    await page.click('[data-testid="store-sales-page-2"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="store-sale"]').length === 3)
    expect(await page.$eval('[data-testid="store-sales-page-2"]', el => el.getAttribute('aria-current'))).toBe('page')
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

/**
 * The dashboard rolls out to named creators first, through the flag's address-list variant. A creator not on
 * the list is not left worse off than before it existed: My Items keeps its own creations section, which is
 * the only thing standing between them and their collections while the new page is closed to them.
 */
describe('when the store dashboard is rolled out to a list of creators', () => {
  it('should open it for an address the list names', async () => {
    app = await launchApp({
      path: '/my-store',
      myStore: true,
      myStoreAllowed: `0x1111111111111111111111111111111111111111,${TEST_ADDRESS}`,
      creatorSales: true,
      fixtures: storeFixtures
    })
    await waitForText(app.page, 'My Store')

    expect(await app.page.evaluate(() => location.pathname)).toBe('/my-store')
  })

  it('should close it for an address the list leaves out', async () => {
    app = await launchApp({
      path: '/my-store',
      myStore: true,
      myStoreAllowed: '0x1111111111111111111111111111111111111111',
      fixtures: storeFixtures
    })
    await app.page.waitForFunction(() => location.pathname !== '/my-store')

    expect(await app.page.evaluate(() => location.pathname)).toBe('/overview')
    expect(await app.page.$('[data-testid="nav-my-store"]')).toBeNull()
  })

  it('should leave my items its creations section for a creator the list leaves out', async () => {
    app = await launchApp({
      path: '/my-items',
      myStore: true,
      myStoreAllowed: '0x1111111111111111111111111111111111111111',
      fixtures: storeFixtures
    })
    await app.page.waitForSelector('[data-testid="filter-collections"]')

    expect(await app.page.$('[data-testid="filter-collections"]')).not.toBeNull()
  })

  it('should take that section away once the dashboard is theirs', async () => {
    app = await launchApp({ path: '/my-items', myStore: true, myStoreAllowed: TEST_ADDRESS, fixtures: storeFixtures })
    await app.page.waitForSelector('[data-testid="nav-my-store"]')

    expect(await app.page.$('[data-testid="filter-collections"]')).toBeNull()
  })
})
