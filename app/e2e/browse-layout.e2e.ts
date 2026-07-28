import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import * as fx from './fixtures'

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
})
