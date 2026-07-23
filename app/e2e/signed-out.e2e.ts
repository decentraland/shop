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
    expect(await page.evaluate(() => document.querySelector('[data-testid="subnav-balance"]') !== null)).toBe(false)

    // Clicking Buy now signed-out no longer dead-ends: handleBuyNow stashes a resume intent and
    // redirects into the sign-in flow (so the purchase resumes after the round-trip). It never
    // silently no-ops and never reaches /success unauthenticated.
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)
    await page.waitForFunction(() => window.location.pathname.startsWith('/auth'))

    expect(await page.evaluate(() => window.location.pathname.startsWith('/auth'))).toBe(true)
    expect(await page.evaluate(() => window.location.pathname === '/success')).toBe(false)
    // The buy was stashed to resume after sign-in (sessionStorage survives the same-origin redirect).
    expect(await page.evaluate(() => window.sessionStorage.getItem('shop:resume_after_signin'))).toContain('item-buy')
  })
})
