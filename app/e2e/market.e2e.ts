import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, startCartCheckout, waitForText } from './helpers/dom'
import { legacyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('legacy (fluctuating-price) liquidity in the unified browse', () => {
  it('keeps /market as an alias that lands on the unified browse grid', async () => {
    app = await launchApp({ path: '/market' })
    const { page } = app

    // /market redirects to the unified browse (old links must not 404).
    await page.waitForFunction(() => window.location.pathname === '/assets', { timeout: 20000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe('/assets')
    await waitForText(page, 'Retro Cap')
  })

  it('adds a legacy item to the cart and buys it from there', async () => {
    // The point of the change: a legacy (MANA-priced) listing is now ordinary basket liquidity. Its trade
    // is denominated in MANA, so the cart review prices it through the oracle rate rather than reading the
    // amount as dollars — getting that wrong would not misprice it slightly, it would misprice it by the
    // MANA price. fetchTrade('legacy-trade-1') → legacyTrade; authorize is mocked and the gasless
    // useCredits meta-tx is signed by the mock wallet through the mocked transactions-api.
    app = await launchApp({ path: '/assets', fixtures: { trade: legacyTrade } })
    const { page } = app

    await waitForText(page, 'Retro Cap')

    // Add THE LEGACY card specifically. Every card now carries the same label, so the button can no
    // longer be found by its text — target the card that contains this item's name.
    const added = await page.evaluate(() => {
      const card = [...document.querySelectorAll('[data-testid="card"]')].find(c =>
        (c.textContent || '').includes('Retro Cap')
      )
      const button = card?.querySelector('[data-testid="card-cart"]') as HTMLButtonElement | undefined
      if (!button || button.disabled) return false
      button.click()
      return true
    })
    expect(added).toBe(true)

    // Adding opens the cart drawer; go to the cart from its CTA so the client-side nav keeps the basket.
    await waitForText(page, 'successfully added to cart')
    expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
    await waitForText(page, 'Retro Cap')
    await startCartCheckout(page)

    // Settles through the same credits checkout every other line uses.
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
  })
})
