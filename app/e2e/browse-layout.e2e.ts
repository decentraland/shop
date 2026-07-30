import { describe, it, expect, afterEach } from 'vitest'
import type { Page } from 'puppeteer'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import * as fx from './fixtures'

// The bubble fades AND slides into place over 0.14s, so its box is only meaningful once that settles.
// Opacity and transform share the transition, so full opacity means the slide has landed too.
async function openTooltip(page: Page, x: number, y: number): Promise<void> {
  // Two moves: the first parks the pointer elsewhere so the second produces a mouseover on the trigger.
  await page.mouse.move(x - 60, y - 60)
  await page.mouse.move(x, y)
  await page.waitForSelector('[role="tooltip"][data-open]')
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('[role="tooltip"][data-open]')!).opacity === '1'
  )
}

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// Regression guards for the browse (Collectibles) toolbar + grid layout. These caught two real bugs:
// a duplicated result count in the toolbar, and mobile cards overflowing the viewport (the card body
// grid was missing `display: grid`). Cheap structural assertions — no pixel comparisons.
describe('collectibles browse layout', () => {
  it('renders exactly one result count in the toolbar', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Items')
    const counts = await page.$$eval('[data-testid="browse-count"]', els => els.length)
    expect(counts).toBe(1)
  })

  it('does not overflow horizontally on a mobile viewport', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })
    await waitForText(page, 'Items')
    // The grid must fit the viewport (the card-body grid regression pushed cards off-screen).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
    // And a card's own content must not overflow its frame (the name/price row clipped the price).
    const cardOverflow = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="card"]') as HTMLElement | null
      return c ? c.scrollWidth > c.clientWidth + 1 : false
    })
    expect(cardOverflow).toBe(false)
  })

  // A name too long to sit beside the price takes the whole row and the price drops below it, next to a
  // round action (the AssetCard measures this — no CSS can key off text length). Needs a real browser.
  it('stacks the footer of a long-named card: price below the name, round action instead of Add to cart', async () => {
    const rows = (fx.unifiedListings as { data: Record<string, unknown>[] }).data
    const long = 'Asset Name Asset Name Asset Name Asset Name'
    app = await launchApp({
      path: '/assets',
      fixtures: { unifiedListings: { data: [rows[1], { ...rows[0], name: long }] } }
    })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    await page.waitForSelector('[data-testid="card"][data-stacked]')

    const cards = await page.$$eval('[data-testid="card"]', els =>
      els.map(el => {
        const name = el.querySelector('[data-testid="card-link"]')?.getAttribute('aria-label') ?? ''
        const price = (el.querySelector('[data-testid="card-price"]') as HTMLElement).getBoundingClientRect()
        const author = (el.querySelector('[data-testid="card-author"]') as HTMLElement).getBoundingClientRect()
        return {
          name,
          stacked: el.hasAttribute('data-stacked'),
          cart: !!el.querySelector('[data-testid="card-cart"]'),
          round: !!el.querySelector('[data-testid="card-add-round"]'),
          // Is the price on its own line, under the name/author column?
          priceBelow: price.top >= author.bottom
        }
      })
    )

    const short = cards.find(c => c.name === 'Nebula Jacket')!
    const wrapped = cards.find(c => c.name === long)!
    // Short name: price beside it, full-width Add to cart (revealed on hover) still in the DOM.
    expect(short.stacked).toBe(false)
    expect(short.priceBelow).toBe(false)
    expect(short.cart).toBe(true)
    // Long name: price on the next row, and the round action replaces the full-width button.
    expect(wrapped.stacked).toBe(true)
    expect(wrapped.priceBelow).toBe(true)
    expect(wrapped.cart).toBe(false)
    expect(wrapped.round).toBe(true)
  })

  // ...but a name that only just misses the row must NOT restructure the card. This is the regression:
  // "Midnight Black Tuxedo Trousers" is a real catalogue name that wanted 11px more than its row had, and
  // that was enough to move its price, reshape its action and drop its rarity/category chips — one odd
  // card in a grid of 48. The name box ellipsises, so a few pixels must cost a few pixels.
  it('keeps a name that only slightly exceeds its row inline, chips and all', async () => {
    const rows = (fx.unifiedListings as { data: Record<string, unknown>[] }).data
    const snug = 'Midnight Black Tuxedo Trousers'
    app = await launchApp({
      path: '/assets',
      fixtures: { unifiedListings: { data: [rows[1], { ...rows[0], name: snug }] } }
    })
    const { page } = app
    await waitForText(page, snug)
    // The measurement re-runs when the webfont swaps in, so settle before asserting on it.
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForSelector('[data-testid="card-cart"]')

    const card = await page.evaluate(name => {
      const el = [...document.querySelectorAll('[data-testid="card"]')].find(
        c => c.querySelector('[data-testid="card-link"]')?.getAttribute('aria-label') === name
      ) as HTMLElement
      const span = el.querySelector('[title]')?.querySelector('span') as HTMLElement
      const roundEl = el.querySelector('[data-testid="card-add-round"]') as HTMLElement | null
      return {
        stacked: el.hasAttribute('data-stacked'),
        // The round action is always in the DOM (CSS reveals it per layout), so presence proves nothing —
        // what matters is that this card does not SHOW it.
        roundShown: !!roundEl && getComputedStyle(roundEl).display !== 'none',
        cart: !!el.querySelector('[data-testid="card-cart"]'),
        chips: !!el.querySelector('[data-chips]')?.childElementCount,
        // Proof the name really does overflow its box, so this test cannot pass for the wrong reason by
        // asserting nothing about the tolerance because there was nothing to tolerate. Only meaningful in
        // the inline layout — stacked, the name owns the full row and would not overflow — so it is
        // asserted after `stacked`.
        overflows: span.offsetWidth > (span.closest('[title]') as HTMLElement).clientWidth
      }
    }, snug)

    // The card keeps the ordinary layout: price beside the name, full-width Add to cart, chips intact.
    expect(card.stacked).toBe(false)
    expect(card.roundShown).toBe(false)
    expect(card.cart).toBe(true)
    expect(card.chips).toBe(true)
    expect(card.overflows).toBe(true)
  })

  // The filter sidebar scrolls internally, and overflow clips BOTH axes — an absolutely-positioned
  // tooltip inside it lost its first word off the left edge. The bubble is portalled to <body> now.
  it('shows the whole SMART hint tooltip, not cropped by the filter sidebar', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'SMART')

    const anchor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="smart-hint"]') as HTMLElement | null
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    expect(anchor).not.toBeNull()
    await openTooltip(page, anchor!.x, anchor!.y)

    const fit = await page.evaluate(() => {
      const bubble = document.querySelector('[role="tooltip"][data-open]') as HTMLElement
      const b = bubble.getBoundingClientRect()
      // Every clipping ancestor the bubble now has to survive.
      let clipped = false
      for (let el = bubble.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el)
        if (!/auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY)) continue
        const c = el.getBoundingClientRect()
        if (b.left < c.left - 1 || b.right > c.right + 1) clipped = true
      }
      return {
        clipped,
        inViewport: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight,
        text: bubble.textContent
      }
    })
    expect(fit.text).toMatch(/smart wearables add/i)
    expect(fit.clipped).toBe(false)
    expect(fit.inViewport).toBe(true)
  })

  // A fixed bubble that lands off-screen cannot be scrolled to, so it must flip/clamp instead. The SMART
  // hint opens downwards and its trigger sits at the bottom of a scrolled filter sidebar.
  it('keeps the tooltip on screen when its trigger is near the bottom of the viewport', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await page.setViewport({ width: 1280, height: 620 })
    await waitForText(page, 'SMART')

    const anchor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="smart-hint"]') as HTMLElement | null
      if (!el) return null
      // Push the trigger as low as the sidebar's own scroll allows.
      el.scrollIntoView({ block: 'end' })
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, viewport: window.innerHeight }
    })
    expect(anchor).not.toBeNull()
    await openTooltip(page, anchor!.x, anchor!.y)

    const box = await page.evaluate(() => {
      const b = document.querySelector('[role="tooltip"][data-open]')!.getBoundingClientRect()
      return { top: b.top, bottom: b.bottom, viewport: window.innerHeight }
    })
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(box.viewport)
  })
})
