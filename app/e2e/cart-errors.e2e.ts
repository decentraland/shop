import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

// Cart checkout error path: a hard authorize failure (500, NOT a 402 insufficient) drives the
// CartCheckoutModal into its error phase, which renders <ErrorNotice> (.error-notice). Nothing is
// purchased and the page never navigates to /success.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('cart checkout error path', () => {
  it('shows an error notice when authorize hard-fails (500) and never navigates to /success', async () => {
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 500 } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)

    // Adding opens the cart drawer; go to the cart page from its CTA, then check out.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'button', /^buy now$/i)).toBe(true)

    // Review passes (default balance covers the item) → charge → authorize 500 → error phase modal.
    await page.waitForSelector('.error-notice', { timeout: 30000 })
    await waitForText(page, "Couldn't complete checkout")

    // The raw server error must not leak, nothing was purchased, and we stay on /cart.
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).not.toContain('authorizeUsdCredit')
    expect(body).not.toContain('Your purchase was successful')
    expect(await page.evaluate(() => window.location.pathname)).toBe('/cart')
  })
})
