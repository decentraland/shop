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

  /**
   * Reading the countdown's TEXT proves the timestamp arrived in the right unit and nothing else. It does
   * not notice a pill drawn outside its own card, or one whose text is the same colour as what is behind
   * it — both of which this card shipped with. So these two measure geometry and contrast instead.
   */
  it('keeps the countdown inside its card at phone width, on every side', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })

    await waitForText(page, 'Galaxy Hat')
    const box = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="card-countdown"]') as HTMLElement
      const card = pill.closest('[data-testid="card"]') as HTMLElement
      const p = pill.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      return {
        overBottom: p.bottom - c.bottom,
        overTop: c.top - p.top,
        overLeft: c.left - p.left,
        overRight: p.right - c.right
      }
    })

    // Half a pixel of slack for sub-pixel rounding; anything past that is the pill escaping the card.
    expect(box.overBottom).toBeLessThanOrEqual(0.5)
    expect(box.overTop).toBeLessThanOrEqual(0.5)
    expect(box.overLeft).toBeLessThanOrEqual(0.5)
    expect(box.overRight).toBeLessThanOrEqual(0.5)
  })

  it('keeps the countdown readable against its own fill, on the light card and the dark one alike', async () => {
    app = await launchApp({ path: '/items', fixtures: { unifiedListings: unifiedListingsOnSale } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    const ratio = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="card-countdown"]') as HTMLElement
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
      // Composite every layer up the tree: a translucent fill takes the colour of whatever is behind it,
      // which is how the same tokens read on one surface and vanished on another.
      let bg = [255, 255, 255]
      const chain: number[][] = []
      for (let el: HTMLElement | null = pill; el; el = el.parentElement)
        chain.push(parse(getComputedStyle(el).backgroundColor))
      for (let i = chain.length - 1; i >= 0; i--) {
        const [r, g, b, a = 1] = chain[i]
        if (a === 0 || r === undefined) continue
        bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)]
      }
      const fg = parse(getComputedStyle(pill).color)
      const lum = (c: number[]) => {
        const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
      return (hi + 0.05) / (lo + 0.05)
    })

    // WCAG AA for text this size. The pill shipped at 2.6:1 — below even the 3:1 floor for UI text.
    expect(ratio).toBeGreaterThanOrEqual(4.5)
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
