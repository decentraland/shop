import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'
import { RESUME_BUY_KEY } from '../src/lib/resume-buy'

// The GetCredits page lives at /credits (App.tsx). Stripe's hosted checkout redirects back here with
// ?order=<id> on success or ?canceled=1 on cancel; in e2e the payments layer runs in MOCK mode
// (no stripePublishableKey), so pollCreditGrant tops up via /dev/mint-usd instead of polling
// /credits/orders/:id. These specs exercise that return handling end-to-end.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('get credits — Stripe return handling', () => {
  it('credits the account on a successful return (?order=) and raises the balance chip', async () => {
    // Land on the success return URL. The return effect shows the processing state, then (once the
    // wallet identity is restored) polls the grant → mock mints $10 (pack_10) → success. The order id
    // encodes the pack: mock_cs_<packId>_<n> → pack_10 → 100 credits granted.
    app = await launchApp({ path: '/credits?order=mock_cs_pack_10_1' })
    const { page } = app

    // Starting balance is creditsResponse.usd.credits = 500.
    await page.waitForSelector('.subnav__balance', { timeout: 20000 })

    // Reaches the success state with the granted amount (100 credits for the $10 pack).
    await waitForText(page, 'Your purchase was successful', 30000)
    await waitForText(page, '100')

    // The mock grant folds $10 (=100 credits) into the balance refetch: 500 → 600.
    await page.waitForFunction(
      () => !!document.querySelector('.subnav__balance')?.textContent?.includes('600'),
      { timeout: 20000 }
    )
    expect(await page.evaluate(() => document.querySelector('.subnav__balance')?.textContent?.includes('600'))).toBe(true)

    // The success return must NOT be treated as an error.
    expect(await page.$('.error-notice')).toBeNull()
  })

  it('shows a gentle canceled note (?canceled=1) and keeps the pack grid — no error', async () => {
    app = await launchApp({ path: '/credits?canceled=1' })
    const { page } = app

    // The canceled note renders and the pack grid stays intact (all four packs).
    await waitForText(page, 'Payment canceled')
    await page.waitForSelector('.pack', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelectorAll('.pack').length)).toBe(4)

    // A cancel is not an error state.
    expect(await page.$('.error-notice')).toBeNull()
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('Something went wrong')
  })

  it('resumes a pending item buy after the top-up return and auto-completes the purchase', async () => {
    // Seed a pending resume-buy item (as BuyModal.buyCreditsAndItem stashes it) BEFORE the return
    // navigation, so pollForGrant reads it after crediting and routes to the item's BuyModal in resume
    // mode. sessionStorage survives the same-origin navigation below.
    app = await launchApp({ path: '/credits', fixtures: { trade: buyTrade } })
    const { page } = app

    const pendingItem = {
      id: `${COLLECTION}-1`,
      contractAddress: COLLECTION,
      itemId: '1',
      tokenId: '7',
      tradeId: 'trade-2',
      name: 'Nebula Jacket',
      priceCredits: 135,
      category: 'wearable'
    }
    await page.evaluate(
      (key: string, item: unknown) => sessionStorage.setItem(key, JSON.stringify(item)),
      RESUME_BUY_KEY,
      pendingItem
    )

    // Navigate to the success return URL (pack_25 → $25 top-up → 250 credits). Same origin, so the
    // seeded sessionStorage + the request-interception mocks both persist.
    await page.goto(`${BASE}/credits?order=mock_cs_pack_25_1`, {
      waitUntil: 'networkidle2',
      timeout: 45000
    })

    // After crediting, GetCredits routes to /item/<collection>/7 and the BuyModal opens in resume mode
    // (auto-confirms) → the purchase completes without a second click.
    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'My Assets')
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/7`)
  })
})
