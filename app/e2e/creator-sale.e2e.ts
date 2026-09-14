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

const builderItem = (bid: string, name: string) => ({
  id: `item-${bid}`,
  collection_id: 'col-1',
  contract_address: COLLECTION,
  blockchain_item_id: bid,
  name,
  thumbnail: 'thumbnail.png',
  contents: { 'thumbnail.png': 'bafyfake' },
  is_published: true,
  is_approved: true,
  total_supply: 0,
  rarity: 'epic',
  type: 'wearable',
  data: { wearable: { category: 'hat' } }
})

// Note the fixtures below hand the SAME rows to `shopListings` and `collectionSaleState`: the collection
// catalogue is what marks an item on sale, and the shop feed is what prices the USD-pegged ones. A listing
// present in only one of the two is not a listing the page can show.
const noOverflow = (page: App['page']) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

describe('creator sales', () => {
  it('puts a collection on sale from My Creations, on a phone-sized screen', async () => {
    app = await launchApp({
      path: '/my-items',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
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
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await waitForText(page, 'Galaxy Drip')
    await waitForText(page, '1 item listed')
    // 20% off by default: the cheapest listed item (30 credits) previews at 24.
    await waitForText(page, 'sells for 24 credits')
    expect(await noOverflow(page)).toBe(true)

    // The collection is the scope, not a choice: it is stated, with nothing to untick.
    expect(await page.$('[data-testid="creator-sale-collections"] input')).toBeNull()

    // Pick 30% → the example follows.
    expect(await clickByText(page, '[data-testid="creator-sale-discounts"] button', /^30% off$/i)).toBe(true)
    await waitForText(page, 'sells for 21 credits')

    // Nothing is signed from the form — the terms go to a review first.
    await clickWhenEnabled(page, '[data-testid="creator-sale-continue"]', /review discount/i)
    await page.waitForSelector('[data-testid="creator-sale-review"]')
    await waitForText(page, '1 item gets the discount')
    expect(await noOverflow(page)).toBe(true)

    // One signature, one POST, then the success view with its countdown.
    await clickWhenEnabled(page, '[data-testid="creator-sale-submit"]', /start discount/i)
    await page.waitForSelector('[data-testid="creator-sale-success"]')
    await waitForText(page, 'Your discount is live!')
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
        shopListings: galaxyListed,
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

    expect(await clickByText(page, '[data-testid="creator-sale-end"]', /end discount/i)).toBe(true)
    // Two-step: the row asks before anything is sent.
    await page.waitForSelector('[data-testid="creator-sale-end-confirm"]')
    expect(await clickByText(page, '[data-testid="creator-sale-end-confirm"]', /end now/i)).toBe(true)

    await waitForText(page, 'Your discount has ended.')
    await waitForText(page, 'Ended early')
    expect(await page.$('[data-testid="creator-sale-end"]')).toBeNull()
  })

  it('separates each collection and offers the sale only where something is listed', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
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

  it('reviews every item, and says which ones the sale leaves alone', async () => {
    const listed = (itemId: string, name: string, price: number) => ({
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
      priceCredits: price,
      available: 10,
      network: 'MATIC',
      chainId: 80002
    })
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: { data: [listed('0', 'Galaxy Hat', 30), listed('1', 'Galaxy Boots', 10)] },
        unifiedListings: { data: [] },
        builderItems: {
          data: [
            builderItem('0', 'Galaxy Hat'),
            builderItem('1', 'Galaxy Boots'),
            // Never listed, so the sale cannot touch it — the review has to say so.
            builderItem('2', 'Galaxy Cape')
          ]
        },
        collectionSaleState: { data: [listed('0', 'Galaxy Hat', 30), listed('1', 'Galaxy Boots', 10)], total: 2 }
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Cape')
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await clickWhenEnabled(page, '[data-testid="creator-sale-continue"]', /review discount/i)
    await page.waitForSelector('[data-testid="creator-sale-review"]')

    // Every listed item, with what it costs now and what it will cost. 20% off: 30 → 24, 10 → 8.
    const rows = await page.$$eval('[data-testid="creator-sale-review-item"]', els =>
      els.map(e => ({
        name: e.querySelector('[data-testid="review-name"]')?.textContent,
        was: e.querySelector('[data-testid="review-was"]')?.textContent,
        now: e.querySelector('[data-testid="review-now"]')?.textContent
      }))
    )
    expect(rows).toEqual([
      { name: 'Galaxy Hat', was: '30', now: '24' },
      { name: 'Galaxy Boots', was: '10', now: '8' }
    ])

    // And the one that is not listed, named rather than silently dropped.
    await waitForText(page, '1 item is not listed and stays as it is')
    const untouched = await page.$$eval('[data-testid="creator-sale-review-untouched"] li', els =>
      els.map(e => e.textContent?.replace(/\s+/g, ' ').trim())
    )
    expect(untouched).toEqual(['Galaxy CapeNot for sale'])

    // Uncapped, so the ceiling is the listed items' own remaining supply (100 + 100 for two rares).
    await waitForText(page, 'available at the discounted price')

    // Back returns to the terms with them intact.
    expect(await clickByText(page, '[data-testid="creator-sale-back"]', /back/i)).toBe(true)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await waitForText(page, 'sells for 24 credits')
  })

  it('grades the discount chips by how deep the cut is, and opens each input in its chip', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')

    // Four distinct steps, warming as the discount deepens — not one colour repeated.
    const fills = await page.$$eval('[data-testid="creator-sale-discounts"] button[data-heat]', els =>
      els.map(e => getComputedStyle(e).backgroundColor)
    )
    expect(fills).toHaveLength(4)
    expect(new Set(fills).size).toBe(4)

    // The chip IS the field: picking Custom collapses the button away and opens the input in its place.
    const width = (sel: string) => page.$eval(sel, el => (el as HTMLElement).getBoundingClientRect().width)
    const settled = (sel: string, open: boolean) =>
      page.waitForFunction(
        (s: string, o: boolean) => {
          const el = document.querySelector(s)
          if (!el) return false
          const w = el.getBoundingClientRect().width
          return o ? w > 0 : w === 0
        },
        { timeout: 5000 },
        sel,
        open
      )

    expect(await width('[data-testid="creator-sale-custom-pct-chip"]')).toBeGreaterThan(0)
    expect(await width('[data-testid="creator-sale-custom-pct-field"]')).toBe(0)

    expect(await clickByText(page, '[data-testid="creator-sale-discounts"] button', /^custom$/i)).toBe(true)
    await settled('[data-testid="creator-sale-custom-pct-chip"]', false)
    expect(await width('[data-testid="creator-sale-custom-pct-field"]')).toBeGreaterThan(0)

    // Same for the two date pickers, which used to drop a field below the row.
    expect(await width('[data-testid="creator-sale-custom-end-field"]')).toBe(0)
    expect(await clickByText(page, '[data-testid="creator-sale-durations"] button', /^pick an end$/i)).toBe(true)
    // Settle on the chip reaching zero, not on the field appearing: the tracks interpolate, so mid-flight
    // the collapsing half is briefly WIDER than either end state.
    await settled('[data-testid="creator-sale-custom-end-chip"]', false)
    expect(await width('[data-testid="creator-sale-custom-end-field"]')).toBeGreaterThan(0)
  })

  it('keeps the modal the same height whatever the terms are', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')

    /**
     * The height once it has stopped moving, rather than the height after a fixed wait.
     *
     * The morphs animate for 0.24s, and a loaded CI runner can still be mid-transition when a timeout that
     * is generous on a laptop expires — which read as the card changing size when it was only part-way
     * through not changing size.
     */
    const height = async () => {
      let last = -1
      for (let i = 0; i < 40; i++) {
        const now = await page.$eval('[data-testid="creator-sale-modal"]', el =>
          Math.round((el as HTMLElement).getBoundingClientRect().height)
        )
        if (now === last) return now
        last = now
        await page.evaluate(() => new Promise(r => setTimeout(r, 100)))
      }
      return last
    }

    const heights: number[] = [await height()]
    for (const label of [/^10% off$/i, /^50% off$/i, /^custom$/i]) {
      expect(await clickByText(page, '[data-testid="creator-sale-discounts"] button', label)).toBe(true)
      heights.push(await height())
    }
    for (const label of [/^pick an end$/i, /^7 days$/i]) {
      expect(await clickByText(page, '[data-testid="creator-sale-durations"] button', label)).toBe(true)
      heights.push(await height())
    }
    expect(await clickByText(page, 'button', /^on a date$/i)).toBe(true)
    heights.push(await height())
    await page.click('[data-testid="creator-sale-cap-toggle"]')
    heights.push(await height())

    // One height, every combination. The example line rewraps with the numbers in it and the date and cap
    // fields used to arrive as whole new rows, so the card grew and shrank underneath the pointer.
    // A couple of pixels of slack for font metrics, which differ between a laptop and CI's headless
    // Chrome; a row arriving or leaving is 40px, so this cannot hide the thing the test is for.
    const spread = Math.max(...heights) - Math.min(...heights)
    expect(spread, `heights across the terms: ${heights.join(', ')}`).toBeLessThanOrEqual(2)
  })

  it('times the start and the end separately, in the discount’s own colour', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    // Schedule it, so the start is a moment in the future with its own time left.
    expect(await clickByText(page, 'button', /^on a date$/i)).toBe(true)
    expect(await clickByText(page, '[data-testid="creator-sale-discounts"] button', /^50% off$/i)).toBe(true)
    await clickWhenEnabled(page, '[data-testid="creator-sale-continue"]', /review discount/i)
    await page.waitForSelector('[data-testid="creator-sale-review"]')

    // Each end of the window is its own row, and each says how long until it.
    for (const row of ['creator-sale-review-starts', 'creator-sale-review-ends']) {
      const text = await page.$eval(`[data-testid="${row}"]`, el => el.textContent ?? '')
      expect(text).toMatch(/\d/)
      expect(text).toMatch(/\d+[dhms]/)
    }

    // One colour per step, everywhere it shows: the badge here, the discounted price here, and the chip
    // back on the terms. They drifted apart once — a bright ring on the chip against a darker price —
    // and the review read as a different discount from the one that had been picked.
    const heat = await page.evaluate(() => {
      const badge = document.querySelector('[data-testid="creator-sale-review-pct"]') as Element
      const price = document.querySelector('[data-testid="review-now"]') as Element
      return {
        step: [badge.getAttribute('data-heat'), price.getAttribute('data-heat')],
        badgeColor: getComputedStyle(badge).color,
        badgeBorder: getComputedStyle(badge).borderTopColor,
        priceColor: getComputedStyle(price).color
      }
    })
    expect(heat.step).toEqual(['max', 'max'])
    expect(heat.priceColor).toBe(heat.badgeColor)
    expect(heat.badgeBorder).toBe(heat.badgeColor)

    expect(await clickByText(page, '[data-testid="creator-sale-back"]', /back/i)).toBe(true)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    const chipColor = await page.$eval(
      '[data-testid="creator-sale-discounts"] button[data-selected]',
      el => getComputedStyle(el).color
    )
    expect(chipColor).toBe(heat.priceColor)
  })

  it('drops a failed attempt when the creator goes back to change the terms', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
        unifiedListings: { data: [] },
        collectionSaleState: galaxyListed
      },
      errors: { '/v1/coupons': { status: 500 } }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await clickWhenEnabled(page, '[data-testid="creator-sale-continue"]', /review discount/i)
    await page.waitForSelector('[data-testid="creator-sale-review"]')

    await clickWhenEnabled(page, '[data-testid="creator-sale-submit"]', /start discount/i)
    await page.waitForSelector('[data-testid="creator-sale-error"]')

    // Back to the terms, and forward again: the notice belonged to an attempt that no longer exists.
    expect(await clickByText(page, '[data-testid="creator-sale-back"]', /back/i)).toBe(true)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    expect(await page.$('[data-testid="creator-sale-error"]')).toBeNull()
    await clickWhenEnabled(page, '[data-testid="creator-sale-continue"]', /review discount/i)
    await page.waitForSelector('[data-testid="creator-sale-review"]')
    expect(await page.$('[data-testid="creator-sale-error"]')).toBeNull()
  })

  it('hides the whole flow while the flag is off', async () => {
    app = await launchApp({
      path: '/my-items',
      fixtures: {
        importable: { data: [] },
        shopListings: galaxyListed,
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
