import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('cart checkout', () => {
  it('adds an item, then checks the cart out to success', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)

    // Adding opens the cart drawer with a success banner. Go to the cart page from its primary CTA
    // (client-side nav keeps the cart state) and check out.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Checkout')
    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'button', /^checkout$/i)).toBe(true)

    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
  })
})
