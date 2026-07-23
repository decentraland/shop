import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

// Cart availability: when the cart opens, each line's live trade is validated. A line whose listing is
// gone (sold / cancelled / expired) is shown as no-longer-available, excluded from the total, and — if
// it's the only line — the checkout CTA is disabled with a clear message.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// A single secondary (unique-token) cart line in the shop cart's persisted shape (zustand persist:
// { state: { items }, version }). Its trade (trade-2) is forced to 404 below, so the on-open check
// resolves it as gone.
const persistedCart = JSON.stringify({
  state: {
    items: [
      {
        id: 'trade-2',
        tradeId: 'trade-2',
        tokenId: '7',
        itemId: '1',
        contractAddress: COLLECTION,
        name: 'Nebula Jacket',
        creator: CREATOR_ADDRESS,
        category: 'wearable',
        rarity: 'legendary',
        network: 'MATIC',
        chainId: 80002,
        thumbnail: '',
        priceCredits: 135,
        gender: null,
        isSmart: false,
        quantity: 1
      }
    ]
  },
  version: 2
})

describe('cart availability', () => {
  it('marks a gone listing as no longer available and disables checkout', async () => {
    // Force the line's trade to 404 and empty the shop feed, so both the direct fetch and the by-item
    // re-resolution report no live listing.
    app = await launchApp({
      path: '/',
      fixtures: { shopListings: { data: [], total: 0 } },
      errors: { '/v1/trades/trade-2': { status: 404 } }
    })
    const { page } = app

    // Seed the cart, then load the cart page so it rehydrates from localStorage.
    await page.evaluate(c => localStorage.setItem('dcl_shop_cart', c), persistedCart)
    await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 45000 })

    // The line renders immediately (optimistic), then reconciles to the unavailable state.
    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'No longer available')

    // The all-unavailable message shows and the Buy now CTA is disabled.
    await waitForText(page, 'None of these items are available anymore')
    const buyDisabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /buy now/i.test(b.textContent || ''))
      return !!btn && btn.disabled
    })
    expect(buyDisabled).toBe(true)
  })
})
