import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, startCartCheckout, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

// Cart checkout error path: a hard authorize failure (500, NOT a 402 insufficient) drives the
// CartCheckoutModal into its error phase (Figma 1182-196586): the pink `.buy-error` panel with the
// "Oops! Something went wrong" headline + a Try again CTA. Nothing is purchased and we never reach /success.
//
// The BODY is now the caller's message rather than fixed copy — the modal used to declare `message` and never
// read it, so every failure read "your credits are safe" even when they had been spent (see Cart.spec.tsx).
// A 500 from authorize maps through the page's friendlyError to the generic checkout message.

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
    await startCartCheckout(page)

    // Review passes (default balance covers the item) → charge → authorize 500 → error phase modal.
    await page.waitForSelector('[data-testid="buy-error"]', { timeout: 30000 })
    await waitForText(page, 'Oops! Something went wrong')
    await waitForText(page, "Couldn't complete checkout")
    await waitForText(page, 'Try again')

    // The raw server error must not leak, nothing was purchased, and we stay on /cart.
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).not.toContain('authorizeUsdCredit')
    expect(body).not.toContain('Your purchase was successful')
    expect(await page.evaluate(() => window.location.pathname)).toBe('/cart')
  })
})
