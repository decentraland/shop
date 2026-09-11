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
    await page.waitForSelector('[data-testid="creator-sales-panel"]')
    await waitForText(page, 'No sales yet')

    // The one action becomes available once the listed collection resolves.
    await clickWhenEnabled(page, '[data-testid="creator-sale-open"]', /put on sale/i)
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
  })
})
