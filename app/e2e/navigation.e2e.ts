import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

/**
 * The shell: the sub-nav tabs and the cart badge.
 *
 * Cheap to test and expensive to get wrong — a tab that stops routing, or a cart badge that lies about
 * what's in the basket, is the kind of breakage that survives every other test because each page in
 * isolation is fine.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('the sub-nav', () => {
  it('routes to each section without a full page load', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app
    await waitForText(page, 'Trending Products')

    // Mark the document: a client-side route change must NOT clear it. A tab that hard-navigates (or
    // 404s and reloads) would.
    await page.evaluate(() => ((window as unknown as { __spa?: boolean }).__spa = true))

    for (const [label, expected] of [
      ['collectibles', '/items'],
      ['activity', '/activity'],
      ['my items', '/my-items'],
      ['overview', '/overview']
    ] as const) {
      expect(await clickByText(page, 'a', new RegExp(`^${label}$`, 'i'))).toBe(true)
      await page.waitForFunction(p => window.location.pathname === p, { timeout: 20000 }, expected)
      expect(await page.evaluate(() => (window as unknown as { __spa?: boolean }).__spa)).toBe(true)
    }
  })

  it('counts what is actually in the cart', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')

    // The badge is absent at zero rather than showing a "0" — nothing to count, nothing to draw.
    const badge = '[data-testid="subnav-cart-badge"]'
    expect(await page.$(badge)).toBeNull()

    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
    await waitForText(page, 'successfully added to cart')
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by tsc: this callback is typed against the page context
      sel => (document.querySelector(sel) as HTMLElement | null)?.innerText.trim() === '1',
      { timeout: 20000 },
      badge
    )
  })

  it('keeps the cart across a full reload', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')

    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
    await waitForText(page, 'successfully added to cart')

    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by tsc: this callback is typed against the page context
      () =>
        (document.querySelector('[data-testid="subnav-cart-badge"]') as HTMLElement | null)?.innerText.trim() === '1',
      { timeout: 20000 }
    )
  })
})

// NOT covered here: "Make an offer". It only renders when an item has no buyable listing, and the offers
// flow itself is a disabled "coming soon" button — there is no end-to-end behaviour to drive. Its
// disabled state and tooltip are covered by MakeOfferButton.spec.tsx; when offers ship, that needs a real
// e2e flow, not this placeholder.
