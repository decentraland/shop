import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
import { legacyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('market tab (legacy, fluctuating-price liquidity)', () => {
  it('lists legacy items with an ≈ market price', async () => {
    app = await launchApp({ path: '/market' })
    const { page } = app

    await waitForText(page, 'Retro Cap')
    await waitForText(page, 'Vintage Jacket')
    // Header banner: web2-friendly, follows the live market.
    await waitForText(page, 'follow the live market')
    // Fluctuating price is shown as INDICATIVE (leading ≈) with a "Market price" chip.
    expect(await page.evaluate(() => document.body.innerText.includes('≈'))).toBe(true)
    await waitForText(page, 'Market price')
  })

  it('buys a legacy item via Buy now → success (not the cart)', async () => {
    // fetchTrade('legacy-trade-1') → legacyTrade; authorize is mocked, and the gasless useCredits
    // meta-tx is signed by the mock wallet + relayed through the mocked transactions-api (see helpers).
    app = await launchApp({ path: '/market', fixtures: { trade: legacyTrade } })
    const { page } = app

    await waitForText(page, 'Retro Cap')

    // Hover the first card so its Buy now button renders (cards swap price→action on hover).
    await page.hover('.card')
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
