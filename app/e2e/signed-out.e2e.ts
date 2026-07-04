import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('signed-out buyer', () => {
  it('gates checkout behind sign-in instead of completing the purchase', async () => {
    // No session injected → the app renders signed-out (no wallet, no identity).
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade }, signedOut: true })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    // Signed-out there's no balance chip (only rendered when a session exists).
    expect(await page.evaluate(() => document.querySelector('.subnav__balance') !== null)).toBe(false)

    // Clicking Buy now is gated: handleBuyNow bails with "Log in to check out." and never navigates.
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)
    await waitForText(page, 'Log in to check out')

    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
    expect(await page.evaluate(() => window.location.pathname === '/success')).toBe(false)
  })
})
