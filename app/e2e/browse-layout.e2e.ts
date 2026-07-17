import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

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
    const counts = await page.$$eval('.browse__count, .filterbar__count', els => els.length)
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
      const c = document.querySelector('.card') as HTMLElement | null
      return c ? c.scrollWidth > c.clientWidth + 1 : false
    })
    expect(cardOverflow).toBe(false)
  })
})
