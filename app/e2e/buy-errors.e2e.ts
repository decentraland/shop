import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade, ownTrade } from './fixtures'

// The BuyModal (PDP "Buy now") error phase: both the own-listing guard and a hard authorize failure
// render <ErrorNotice> (.error-notice) in place and never move money / navigate away.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy modal error paths', () => {
  it('blocks buying your own listing with a clear message in the error notice', async () => {
    // The trade is SIGNED BY THE TEST USER, so isOwnTrade(trade, buyer) fires when the modal resolves
    // the live trade → it throws "You can't buy your own listing." → the error phase renders it.
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: ownTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // The modal reaches its error phase: <ErrorNotice> with the curated own-listing message.
    await page.waitForSelector('.error-notice', { timeout: 20000 })
    await waitForText(page, "You can't buy your own listing")

    // No purchase happened — we stay on the item page.
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
  })

  it('surfaces a generic error notice when authorize hard-fails (500) and never navigates to /success', async () => {
    // Force the credits-server authorize to 500 (a hard failure — NOT a 402 insufficient, which would
    // route to the pack picker). The modal resolves the trade, authorizes → 500 → error phase.
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 500 } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // Error phase: <ErrorNotice> with the generic purchase-failed copy (never the raw 500 / server text).
    await page.waitForSelector('.error-notice', { timeout: 20000 })
    await waitForText(page, "Couldn't complete the purchase")
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).not.toContain('authorizeUsdCredit')

    // Never advanced to a success/complete state, and never navigated to /success.
    expect(body).not.toContain('Purchase complete!')
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
  })
})
