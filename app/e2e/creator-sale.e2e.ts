import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, TEST_ADDRESS } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The creation is LISTED (fetchCollectionSaleState says so), which is what makes its collection saleable.
const galaxyListed = {
  data: [
    {
      tradeId: 'trade-galaxy',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      tokenId: null,
      name: 'Galaxy Hat',
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: TEST_ADDRESS,
      priceCredits: 30,
      available: 10,
      network: 'MATIC',
      chainId: 80002
    }
  ],
  total: 1
}

const DAY = 24 * 60 * 60 * 1000
const activeSale = {
  id: 'coupon-live',
  signer: TEST_ADDRESS,
  chainId: 80002,
  network: 'MATIC',
  checks: {
    uses: 1_000_000,
    expiration: Date.now() + 2 * DAY,
    effective: Date.now() - DAY,
    salt: '0x' + '22'.repeat(32),
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    externalChecks: []
  },
  couponManager: '0x6c956587d9fe70032781edcdc626310648575382',
  couponAddress: '0x4ee8f6b87f4917a3bbc7c8bb3a06db8555f83db9',
  discountType: 1,
  discount: 300_000,
  root: '0x' + '11'.repeat(32),
  collections: [COLLECTION],
  signature: '0x' + 'ab'.repeat(65),
  createdAt: Date.now() - DAY,
  state: { uses: 3, cancelled: false, revoked: false, checkedAt: Date.now() },
  status: 'active'
}

// A second collection with nothing listed — the creations grid must separate the two, and only the
// listed one can be put on sale.
const SECOND_COLLECTION = '0xc0113c1100000000000000000000000000000002'
const twoCollections = {
  data: [
    {
      id: 'col-1',
      name: 'Galaxy Drip',
      eth_address: TEST_ADDRESS,
      contract_address: COLLECTION,
      is_published: true,
      is_approved: true,
      minters: []
    },
    {
      id: 'col-2',
      name: 'Nebula Pack',
      eth_address: TEST_ADDRESS,
      contract_address: SECOND_COLLECTION,
      is_published: true,
      is_approved: true,
      minters: []
    }
  ]
}
const twoCollectionsItems = {
  data: [
    {
      id: 'item-1',
      collection_id: 'col-1',
      contract_address: COLLECTION,
      blockchain_item_id: '0',
      name: 'Galaxy Hat',
      thumbnail: 'thumbnail.png',
      contents: { 'thumbnail.png': 'bafybeigalaxyhatthumbnailfakehashxxxxxxxxxxxxxxxxxx' },
      is_published: true,
      is_approved: true,
      total_supply: 0,
      rarity: 'epic',
      type: 'wearable',
      data: { wearable: { category: 'hat' } }
    },
    {
      id: 'item-2',
      collection_id: 'col-2',
      contract_address: SECOND_COLLECTION,
      blockchain_item_id: '0',
      name: 'Nebula Cape',
      thumbnail: 'thumbnail.png',
      contents: { 'thumbnail.png': 'bafybeinebulacapethumbnailfakehashxxxxxxxxxxxxxxxx' },
      is_published: true,
      is_approved: true,
      total_supply: 0,
      rarity: 'rare',
      type: 'wearable',
      data: { wearable: { category: 'upper_body' } }
    }
  ]
}

const noOverflow = (page: App['page']) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

describe('creator sales', () => {
  it('puts a collection on sale from My Creations, on a phone-sized screen', async () => {
    app = await launchApp({
      path: '/my-items',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: { data: [] },
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })

    await waitForText(page, 'Galaxy Hat')
    expect(await clickByText(page, 'button', /my creations/i)).toBe(true)
    // Nothing running yet, so the page shows no sales panel at all.
    expect(await page.$('[data-testid="creator-sales-panel"]')).toBeNull()

    // The collection's own header carries the action, once its listing resolves.
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /put on sale/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await waitForText(page, 'Galaxy Drip')
    await waitForText(page, '1 item listed')
    // 20% off by default: the cheapest listed item (30 credits) previews at 24.
    await waitForText(page, 'sells for 24 credits')
    expect(await noOverflow(page)).toBe(true)

    // Pick 30% → the example follows.
    expect(await clickByText(page, '[data-testid="creator-sale-discounts"] button', /^30% off$/i)).toBe(true)
    await waitForText(page, 'sells for 21 credits')

    // One signature, one POST, then the success view with its countdown.
    await clickWhenEnabled(page, '[data-testid="creator-sale-submit"]', /start sale/i)
    await page.waitForSelector('[data-testid="creator-sale-success"]')
    await waitForText(page, 'Your sale is live!')
    await waitForText(page, '1 collection at 30% off')
    await page.waitForSelector('[data-testid="creator-sale-countdown"]')
    expect(await noOverflow(page)).toBe(true)

    // Closing lands back on the panel, which now lists the sale the mock server stored.
    expect(await clickByText(page, '[data-testid="creator-sale-success"] button', /^done$/i)).toBe(true)
    await page.waitForSelector('[data-testid="creator-sale"]')
    await waitForText(page, 'Live')
  })

  it('ends a running sale early after a confirmation', async () => {
    app = await launchApp({
      path: '/my-items',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: { data: [] },
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed,
        coupons: { data: [activeSale] }
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    expect(await clickByText(page, 'button', /my creations/i)).toBe(true)
    await page.waitForSelector('[data-testid="creator-sale"]')
    await waitForText(page, '-30%')
    await waitForText(page, 'Live')

    expect(await clickByText(page, '[data-testid="creator-sale-end"]', /end sale/i)).toBe(true)
    // Two-step: the row asks before anything is sent.
    await page.waitForSelector('[data-testid="creator-sale-end-confirm"]')
    expect(await clickByText(page, '[data-testid="creator-sale-end-confirm"]', /end now/i)).toBe(true)

    await waitForText(page, 'Your sale has ended.')
    await waitForText(page, 'Ended early')
    expect(await page.$('[data-testid="creator-sale-end"]')).toBeNull()
  })

  it('separates each collection and offers the sale only where something is listed', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: { data: [] },
        unifiedListings: { data: [] },
        builderCollections: twoCollections,
        builderItems: twoCollectionsItems,
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app

    await waitForText(page, 'Nebula Cape')
    await page.waitForSelector('[data-testid="creation-group"]')
    const names = await page.$$eval('[data-testid="creation-group-name"]', els => els.map(e => e.textContent?.trim()))
    expect(names).toEqual(['Galaxy Drip', 'Nebula Pack'])

    // Only the collection with a Shop listing carries the per-header CTA: a sale discounts listings, so
    // there is nothing for it to apply to on the other one.
    const ctas = await page.$$eval('[data-testid="creation-group"]', els =>
      els.map(e => Boolean(e.querySelector('[data-testid="creation-group-sale"]')))
    )
    expect(ctas).toEqual([true, false])

    // Consecutive collections are ruled off, so the second header does not sit on the first one's cards.
    const rule = await page.$$eval('[data-testid="creation-group"]', els => {
      const s = getComputedStyle(els[1])
      return { width: parseFloat(s.borderTopWidth), gap: parseFloat(s.paddingTop) }
    })
    expect(rule.width).toBeGreaterThan(0)
    expect(rule.gap).toBeGreaterThan(8)

    // The CTA takes the buy gradient, not the purple primary.
    const cta = await page.$eval('[data-testid="creation-group-sale"]', el => getComputedStyle(el).backgroundImage)
    expect(cta).toContain('gradient')
    expect(cta).toContain('rgb(255, 116, 57)')
  })

  it('hides the whole flow while the flag is off', async () => {
    app = await launchApp({
      path: '/my-items',
      fixtures: {
        importable: { data: [] },
        shopListings: { data: [] },
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')
    expect(await clickByText(page, 'button', /my creations/i)).toBe(true)
    await waitForText(page, 'Galaxy Hat')
    expect(await page.$('[data-testid="creator-sales-panel"]')).toBeNull()
    expect(await page.$('[data-testid="creation-group-sale"]')).toBeNull()
  })
})
