import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, saleTrade, shopListingsOnSale, unifiedListingsOnSale } from './fixtures'

// Selectors of the two marketplace functions a purchase can settle through. The success screen looks the
// same either way, so which one the calldata carries is the whole difference between paying the sale price
// and paying the list price.
const ACCEPT_WITH_COUPON = 'ad1e8700'
const ACCEPT = '961a547e'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy an item a creator put on sale', () => {
  it('shows the sale price, strikes the list price, and settles through acceptWithCoupon', async () => {
    app = await launchApp({
      path: `/item/${COLLECTION}/0`,
      fixtures: { shopListings: shopListingsOnSale, unifiedListings: unifiedListingsOnSale, trade: saleTrade }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')

    // The sale price is what the buyer is asked for; the list price is struck through beside it.
    await waitForText(page, '189')
    const struck = await page.$eval('[data-testid="detail-price-was"]', el => el.textContent ?? '').catch(() => '')
    expect(struck).toContain('270')

    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')
    await clickWhenEnabled(page, 'button', /^buy$/i)

    await waitForText(page, 'Purchase complete!', 30000)

    // The relayed meta-transaction wraps useCredits, whose external call must target acceptWithCoupon.
    // Settling through plain `accept` would ask the marketplace for the full 270 credits.
    const calldata = app.metaTxBodies.join('')
    expect(calldata).toContain(ACCEPT_WITH_COUPON)
    expect(calldata).not.toContain(ACCEPT)
  })
})

describe('buy an item that is not on sale', () => {
  it('still settles through plain accept, so the discounted path is opt-in', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, fixtures: { trade: saleTrade } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')
    await clickWhenEnabled(page, 'button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)

    expect(app.metaTxBodies.join('')).not.toContain(ACCEPT_WITH_COUPON)
  })
})
