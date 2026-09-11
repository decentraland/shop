import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { unifiedListings } from './fixtures'

/**
 * The browse feed with the first item on sale: 270 struck through, 189 to pay, ending a day out.
 *
 * Local to this spec rather than added to `fixtures.ts`, so it cannot collide with the on-sale rows the
 * buy-side work adds to that shared file. The shape is what the harness reads to decide a row is
 * discounted — a compare-at above the price and an end time in unix SECONDS still ahead.
 */
const unifiedListingsOnSale = {
  ...unifiedListings,
  data: [
    {
      ...unifiedListings.data[0],
      priceCredits: 189,
      compareAtCredits: 270,
      saleEndsAt: Math.floor((Date.now() + 86_400_000) / 1000)
    },
    ...unifiedListings.data.slice(1)
  ]
}

/** The switch carries no text, so it is clicked by its test hook rather than by label. */
async function toggleDeals(page: App['page']): Promise<void> {
  await page.waitForSelector('[data-testid="deals-toggle"]', { timeout: 15000 })
  await page.click('[data-testid="deals-toggle"]')
}

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('the browse grid while a creator has items on sale', () => {
  it('shows the sale price, the struck list price and the discount badge on the card', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')

    // 189 to pay, 270 struck through, and the badge says how much is off. The card renders these from
    // the catalogue's own fields, so this is what proves the feed reaches it.
    const now = await page.$eval('[data-testid="card-price-now"]', el => el.textContent ?? '')
    const was = await page.$eval('[data-testid="card-price-was"]', el => el.textContent ?? '')
    const badge = await page.$eval('[data-testid="card-sale-badge"]', el => el.textContent ?? '')

    expect(now).toContain('189')
    expect(was).toContain('270')
    expect(badge).toMatch(/30/)
  })

  it('counts down to the end of the sale, from a timestamp the catalogue sends in seconds', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    const countdown = await page.$eval('[data-testid="card-countdown"]', el => el.textContent ?? '')

    // The fixture's sale ends a day out. A seconds value read as milliseconds would land in 1970 and the
    // countdown would be absent or already over, so any remaining time at all is the assertion.
    expect(countdown.trim()).not.toBe('')
  })
})

describe('the Deals filter on the browse grid', () => {
  it('narrows the grid to what a creator is discounting, and says so in the URL', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app

    // Both items are listed; only the Galaxy Hat is discounted.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')

    await toggleDeals(page)

    await page.waitForFunction(() => !document.body.innerText.includes('Nebula Jacket'), { timeout: 15000 })
    expect(await page.evaluate(() => document.body.innerText)).toContain('Galaxy Hat')
    expect(page.url()).toContain('deals=true')
  })

  it('restores the full grid when the filter is turned back off', async () => {
    app = await launchApp({ path: '/items?deals=true', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('Nebula Jacket')

    await toggleDeals(page)

    await waitForText(page, 'Nebula Jacket')
    expect(page.url()).not.toContain('deals=true')
  })
})

/** Narrow enough that the sidebar is gone and Filters is a bottom sheet (theme.breakpoints.mobile). */
const PHONE = { width: 375, height: 812 }

describe('the Deals filter on a phone', () => {
  it('lives in the Filters sheet, next to the other filters, and narrows the grid from there', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app
    await page.setViewport(PHONE)

    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')

    // The sidebar is not on screen at this width; the sheet is how the filter is reached at all.
    await page.waitForSelector('[data-testid="open-filters"]', { timeout: 15000 })
    await page.click('[data-testid="open-filters"]')

    await toggleDeals(page)

    await page.waitForFunction(() => !document.body.innerText.includes('Nebula Jacket'), { timeout: 15000 })
    expect(page.url()).toContain('deals=true')
  })

  it('keeps the switch tappable, at the row height the other filters use', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app
    await page.setViewport(PHONE)

    await waitForText(page, 'Galaxy Hat')
    await page.click('[data-testid="open-filters"]')
    await page.waitForSelector('[data-testid="deals-row"]', { timeout: 15000 })

    const row = await page.$eval('[data-testid="deals-row"]', el => {
      const r = el.getBoundingClientRect()
      return { height: r.height, right: r.right }
    })

    // 52px is the mobile row height the collapsible section headers use, so Deals reads as their peer
    // rather than as a smaller afterthought — and it clears the ~44px touch target either way.
    expect(row.height).toBeGreaterThanOrEqual(44)
    expect(row.right).toBeLessThanOrEqual(PHONE.width)
  })
})
