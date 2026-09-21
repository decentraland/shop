import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, TEST_ADDRESS } from './fixtures'
import { storeShowcaseFixtures } from './storeShowcase.fixtures'

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

/** Four buyers, one of whom takes most of the store: enough for the collectors figures to mean something. */
const BUYERS = [
  '0xaca5bc79b0cd51b726d2eadfc747f7ad4dfe7efb',
  '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
  '0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2',
  '0xd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3'
]

const sale = (n: number, itemId: string, daysAgo: number, price: string, type = 'mint', buyer = BUYERS[0]) => ({
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

const runningSale = {
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
const sales = [
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
    // 15 against the 6 of the month before it, which the harness now windows properly.
    expect(await text(app, 'store-delta')).toContain('150%')
    expect(await text(app, 'store-discounts')).toBe('1')
    const body = await bodyText(page)
    // Counted by the server's own aggregate, not derived from the page of rows the table happens to hold,
    // and named by who did the selling: a resale is the creator's, a royalty is somebody else's.
    expect(body).toContain('14 first sales · 1 resold')

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
    expect(await page.$$eval('[data-testid="store-sale"]', rows => rows.length)).toBe(5)
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

    // Numbered pages: fifteen sales across three, and the page you are on is marked. The count is asserted
    // before the click so a changed page size fails saying so, rather than timing out on a missing button.
    expect(await page.$$eval('[data-testid^="store-sales-page-"]', pages => pages.length)).toBe(3)
    await page.click('[data-testid="store-sales-page-3"]')
    await page.waitForFunction(
      () => document.querySelector('[data-testid="store-sales-page-3"]')?.getAttribute('aria-current') === 'page'
    )
    expect(await page.$$eval('[data-testid="store-sale"]', rows => rows.length)).toBe(5)
  })

  it('should rank what is selling across the store, leaving out what is not', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 1440, height: 1200 })
    await page.waitForSelector('[data-testid="store-best"]')

    // Ten first sales of the boots against four of the hat. The cape only ever changed hands as a resale
    // and the crown never sold at all, so neither belongs in a ranking of what this store is selling.
    const rows = await page.$$eval('[data-testid="store-best"]', found =>
      found.map(row => (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^1 Galaxy Boots/)
    expect(rows[1]).toMatch(/^2 Galaxy Hat/)

    const sold = await page.$$eval('[data-testid="store-best-sold"]', cells =>
      cells.map(cell => (cell as HTMLElement).innerText.trim())
    )
    expect(sold).toEqual(['10', '4'])
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

/**
 * The figures that say what CHANGED rather than what happened. Each is pinned against the fixture rather
 * than against itself, because the failure they guard is a plausible-looking number, not a missing one.
 */
describe('when a creator reads how their store is doing', () => {
  it('should say which way each figure moved, who is buying, and what is going unsold', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 1440, height: 1300 })
    await page.waitForSelector('[data-testid="store-collection"]')
    const body = await bodyText(page)

    // 15 sold in the window against 6 in the one before it, which the harness derives from the same rows.
    expect(await text(app, 'store-delta')).toContain('150%')
    // Four buyers, one of whom took more than half, which is the fact that reframes the rest.
    expect(await text(app, 'store-collectors')).toBe('4')
    // Nine of the fifteen went to one of them, which is the reading the bare count cannot give.
    // Nine of the fourteen FIRST sales went to one of them. The resale in the fixture is left out: a token
    // the creator flipped is not a customer of their store.
    expect(body).toContain('1 buyer is 64% of sales')
    // The discount has been live two days, with sales before it to compare against.
    await page.waitForSelector('[data-testid="creator-sale-lift"]')
    expect(await text(app, 'creator-sale-lift')).toMatch(/faster|slower|same pace/)
    await page.screenshot({ path: '/tmp/lift.png', clip: { x: 860, y: 150, width: 560, height: 760 } })
  })

  it("should count what nobody bought against the item's whole life, not against this month", async () => {
    app = await launchApp({ path: '/my-store', myStore: true, creatorSales: true, fixtures: storeFixtures })
    await app.page.waitForSelector('[data-testid="store-collection"]')
    const body = await bodyText(app.page)

    // The crown has sold its only copy, so it is sold out rather than unwanted however quiet the month was.
    expect(body).toContain('Saved, never bought')
  })
})

/**
 * One store with something to say in every figure at once.
 *
 * Each case above exercises one of them against a fixture shaped for it. A creator's real store is not
 * shaped for anything, and the risk this covers is the one no single-purpose fixture can reach: the
 * figures reading fine alone and contradicting each other, or crowding each other out, when they all land
 * on the same screen.
 */
describe('when every figure on the dashboard has something to report', () => {
  it('should show them together without any of them displacing another', async () => {
    app = await launchApp({
      path: '/my-store',
      myStore: true,
      creatorSales: true,
      fixtures: storeShowcaseFixtures
    })
    const { page } = app
    await page.setViewport({ width: 1440, height: 1250 })
    await page.waitForSelector('[data-testid="store-collection"]')
    await page.waitForSelector('[data-testid="creator-sale-lift"]')
    const body = await bodyText(page)

    // Twenty-four this month against six the month before, all four buyers counted, one of them most of it.
    expect(await text(app, 'store-sold')).toBe('24')
    // Copies changing hands between collectors, which is the half of the page a first sale cannot report.
    expect(await page.$('[data-testid="store-royalties"]')).not.toBeNull()
    expect(await text(app, 'store-delta')).toContain('%')
    expect(await text(app, 'store-collectors')).toBe('4')
    expect(body).toContain('% of sales')
    // The discount has been live two days with sales on either side of that line.
    expect(await text(app, 'creator-sale-lift')).toMatch(/faster|slower|same pace/)
    // A collection with nothing left wears the chip, and the capsule nobody has bought is called out.
    expect(await page.$('[data-testid="store-collection-soldout"]')).not.toBeNull()
    expect(body).toContain('Saved, never bought')

    // The tiles are grid cells, so one of them running to a second line grows every card beside it. They
    // are measured rather than eyeballed: equal heights are the whole reason the copy is kept short.
    const heights = await page.$$eval('[data-testid="store-sold"]', els => {
      const row = els[0].closest('section')
      return [...(row?.children ?? [])].map(card => Math.round(card.getBoundingClientRect().height))
    })
    expect(new Set(heights).size).toBe(1)

    // The audience band: the people behind the figures, ranked by what they spent. Four buyers, and the
    // one at the top bought the same item over and over rather than spreading across the store.
    expect(await page.$$eval('[data-testid="store-buyer"]', rows => rows.length)).toBe(4)
    expect(body).toContain('Your audience')

    // A tall viewport rather than fullPage: the page's field is a fixed background, which a stitched
    // full-page capture renders once and leaves white underneath.
    await page.setViewport({ width: 1440, height: 2400 })
    await new Promise(resolve => setTimeout(resolve, 400))
    await page.screenshot({ path: '/tmp/showcase.png' })
  })
})

describe('when a visitor opens the store dashboard signed out', () => {
  it('should ask them in through the same panel every other signed-out page uses', async () => {
    app = await launchApp({ path: '/my-store', myStore: true, signedOut: true, fixtures: storeFixtures })
    const { page } = app
    await page.setViewport({ width: 1440, height: 900 })
    await page.waitForSelector('[data-testid="my-store-signin"]')

    // The shared panel, not a title and a button assembled here: an illustration, the ask, what the page
    // is for, and one solid call to action.
    const panel = await page.$eval('[data-testid="my-store-signin"]', el => ({
      illustration: !!el.querySelector('img'),
      text: (el as HTMLElement).innerText
    }))
    expect(panel.illustration).toBe(true)
    expect(panel.text).toContain('Sign in to view your store')
    expect(panel.text).toContain('discounts you have running')
    await page.screenshot({ path: '/tmp/my-store-signedout.png' })
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
