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
  it('adds an item, then checks the cart out to the success modal', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)

    // Adding opens the cart drawer with a success banner. Go to the cart page from its primary CTA
    // (client-side nav keeps the cart state) and check out.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Buy now')
    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'button', /^buy now$/i)).toBe(true)

    // The checkout modal runs review → authorize → gasless buy → settlement, then shows the multi-item
    // success state in place (Figma 1182-220275) — no navigation away to a separate /success page.
    await waitForText(page, 'Your purchase was successful', 30000)
    expect(await page.evaluate(() => window.location.pathname)).toBe('/cart')
  })

  it('shows the Buy Credits and Items (pack picker) state when funds are insufficient', async () => {
    // Force the credits-server authorize step to 402 (insufficient funds). The cart checkout treats
    // that as "not enough credits" — releases any reservation and shows the top-up pack picker instead
    // of a bare error, matching the PDP no-funds flow. No purchase happens.
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)

    // Adding opens the cart drawer; go to the cart page from its CTA, then check out.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /^buy now$/i)).toBe(true)

    await waitForText(page, 'Buy Credits and Items')
    await waitForText(page, 'Insufficient Funds')

    // Never navigated to /success — nothing was purchased.
    expect(await page.evaluate(() => window.location.pathname)).toBe('/cart')
  })
})
