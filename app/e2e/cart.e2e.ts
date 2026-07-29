import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByAria, clickByText, startCartCheckout, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade, primaryTrade, creditsResponse } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('cart checkout', () => {
  it('adds an item, then checks the cart out to the standalone success page', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)

    // Adding opens the cart drawer with a success banner. Go to the cart page from its primary CTA
    // (client-side nav keeps the cart state) and check out.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Nebula Jacket')
    await startCartCheckout(page)

    // The checkout modal runs review → authorize → gasless buy → settlement, then navigates to the
    // standalone /success page (Figma 1182-232376) with the purchased line — no floating in-cart modal.
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    await waitForText(page, 'Your purchase was successful')
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
  })

  it('buys quantity 2 of a PRIMARY item (adds one, steps up to 2) through to the success page', async () => {
    // Galaxy Hat is a primary/mint listing (itemId 0, 270 credits, 100 in stock). Give the wallet a
    // fat balance so 2 × 270 = 540 credits clears without the top-up flow.
    app = await launchApp({
      path: `/item/${COLLECTION}/0`,
      fixtures: {
        trade: primaryTrade,
        credits: { ...creditsResponse, usd: { balanceCents: 100_000, credits: 1_000 } }
      }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Buy now')
    // Primary: Add to cart stays enabled. Add one, then use the drawer's + stepper to reach quantity 2.
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
    await waitForText(page, 'successfully added to cart')
    expect(await clickByAria(page, /increase quantity/i)).toBe(true)

    // The drawer total is now 2 × 270 = 540 credits. Go to the cart page and buy.
    await waitForText(page, '540')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, '540') // qty-2 line subtotal + summary total
    await startCartCheckout(page)

    // Checkout expands the qty-2 primary line into 2 per-unit authorizes + one accept([trade × 2]),
    // then lands on the standalone /success page.
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    await waitForText(page, 'Your purchase was successful')
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
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

    // Adding opens the cart drawer; go to the cart page from its CTA, then check out. Wait for the LINE
    // to render first: the summary CTA paints before the cart store finishes hydrating, and checkout()
    // reads the store directly — clicking earlier is a no-op against an empty basket.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Nebula Jacket')
    await startCartCheckout(page)

    await waitForText(page, 'Buy Credits and Items')
    await waitForText(page, 'Insufficient Funds')

    // The card must stay inside the viewport with its CTAs on screen. It used to grow past a laptop
    // screen at 100% zoom and, being centred in a fixed overlay, put Cancel/Buy out of reach entirely.
    await page.setViewport({ width: 1512, height: 620 })
    const fit = await page.evaluate(() => {
      const warn = document.querySelector('[data-testid="nofunds-warning"]')!
      let card = warn as HTMLElement
      while (card.parentElement && getComputedStyle(card.parentElement).position !== 'fixed') {
        card = card.parentElement
      }
      const c = card.getBoundingClientRect()
      const buy = [...document.querySelectorAll('button')].find(b => /^buy$/i.test((b.textContent || '').trim()))!
      const b = buy.getBoundingClientRect()
      return { cardTop: c.top, cardBottom: c.bottom, buyTop: b.top, buyBottom: b.bottom, viewport: window.innerHeight }
    })
    expect(fit.cardTop).toBeGreaterThanOrEqual(0)
    expect(fit.cardBottom).toBeLessThanOrEqual(fit.viewport)
    expect(fit.buyTop).toBeGreaterThanOrEqual(0)
    expect(fit.buyBottom).toBeLessThanOrEqual(fit.viewport)

    // Never navigated to /success — nothing was purchased.
    expect(await page.evaluate(() => window.location.pathname)).toBe('/cart')
  })
})
