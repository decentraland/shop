import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
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

  it('buys a legacy item via Buy now → success (not the cart)', async () => {
    // fetchTrade('legacy-trade-1') → legacyTrade; authorize + useCredits are mocked (see helpers).
    app = await launchApp({ path: '/assets', fixtures: { trade: legacyTrade } })
    const { page } = app

    await waitForText(page, 'Retro Cap')

    // The legacy card's Buy now (native cards render Add to cart) — enabled once the live rate loads.
    await clickWhenEnabled(page, '.card__cart', /buy now/i)

    // The Buy Now modal opens and locks the price ("Final price" + Confirm purchase).
    await waitForText(page, 'Final price')
    await clickWhenEnabled(page, 'button', /confirm purchase/i)

    // On success the app navigates to /success (never touching the cart).
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
    // The cart badge never appeared — Buy Now is a direct checkout.
    expect(await clickByText(page, '.subnav__cart-badge', /\d/)).toBe(false)
  })
})
