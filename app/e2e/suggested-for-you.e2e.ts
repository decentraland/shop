import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

/**
 * The personalised "Suggested for you" rail on the home page.
 *
 * Needs a real browser for the thing that makes this row different from the others: it personalises
 * from state that only exists in the visitor's own browser. A signed-out shopper who has looked at
 * something gets a personalised rail built from localStorage, and asserting that against a stubbed
 * fetch would assert the stub.
 *
 * What the mock decides is `personalized`, because that flag — not the row's own emptiness — is what
 * the row hides itself on. The ranking is the server's business and is covered by its own tests.
 */

// Screenshots are evidence for a human reading the run, not fixtures — they go to a temp dir like the
// other visual specs, never into the repo.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(tmpdir(), 'shop-suggested-e2e')

// puppeteer will not create the directory it is asked to write into, so a fresh machine — CI, or any
// checkout that has never run this spec — fails on the screenshot rather than on an assertion.
beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true })
})

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/** Visit an item so the browser has something to personalise from, then go home the way a shopper would. */
async function browseThenHome(options: Parameters<typeof launchApp>[0] = {}): Promise<App> {
  const launched = await launchApp({ ...options, path: `/item/${COLLECTION}/1` })
  await waitForText(launched.page, 'Nebula Jacket')
  expect(await clickByText(launched.page, 'a', /overview/i)).toBe(true)
  await waitForText(launched.page, 'Trending Products')
  return launched
}

describe('suggested for you', () => {
  it('shows the rail, under Trending, once the browser has something to personalise from', async () => {
    app = await browseThenHome({ suggestedForYou: true })
    const { page } = app

    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })
    expect(await bodyText(page)).toContain('Suggested for you')

    // Under Trending, not above it: the generic row leads and the personal one follows.
    const order = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('h2'))
      return nodes.map(n => n.textContent?.trim() ?? '')
    })
    const trending = order.findIndex(text => /trending products/i.test(text))
    const suggested = order.findIndex(text => /suggested for you/i.test(text))
    expect(trending).toBeGreaterThanOrEqual(0)
    expect(suggested).toBeGreaterThan(trending)
  })

  it('explains every card, in plain language and without naming a raw id', async () => {
    app = await browseThenHome({ suggestedForYou: true })
    const { page } = app

    await page.waitForSelector('[data-testid="suggested-reason"]', { timeout: 15000 })
    const reasons = await page.$$eval('[data-testid="suggested-reason"]', nodes =>
      nodes.map(n => n.textContent?.trim() ?? '')
    )

    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.every(text => text.length > 0)).toBe(true)
    // A contract address in the copy would mean a name failed to resolve and the raw id leaked through.
    expect(reasons.some(text => /0x[0-9a-f]{6}/i.test(text))).toBe(false)
  })

  it('hides itself when the server had no personal signal, rather than showing a generic rail', async () => {
    app = await browseThenHome({ suggestedForYou: true, suggested: { personalized: false } })
    const { page } = app

    // Trending has rendered by now (browseThenHome waited for it), so the page has settled.
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
    expect(await bodyText(page)).not.toContain('Suggested for you')
  })

  it('hides itself when the server returns too few rows to be worth the space', async () => {
    app = await browseThenHome({ suggestedForYou: true, suggested: { count: 2 } })
    const { page } = app

    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('does not ask at all while the feature is off', async () => {
    app = await browseThenHome()
    const { page } = app

    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('lays out on a phone without spilling sideways', async () => {
    app = await launchApp({ suggestedForYou: true, path: `/item/${COLLECTION}/1` })
    const { page } = app
    await page.setViewport({ width: 375, height: 812 })
    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'a', /overview/i)).toBe(true)
    await waitForText(page, 'Trending Products')

    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })
    // Bring the rail into frame: the point of the screenshot is the rail, and it sits below the fold.
    await page.$eval('[data-testid="suggested-row"]', el => el.scrollIntoView({ block: 'center' }))
    await new Promise(r => setTimeout(r, 400))
    await page.screenshot({ path: join(SHOTS, 'suggested-for-you-mobile.png') })

    // The rail scrolls horizontally inside its own track; the PAGE must not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // The FIRST card is the one on screen — the rest are a scroll away inside the track, which is what
    // a rail is. Its explanation has to fit the viewport rather than run under the edge.
    const first = await page.$$eval('[data-testid="suggested-reason"]', nodes => {
      const rect = nodes[0]?.getBoundingClientRect()
      return rect ? { left: rect.left, right: rect.right } : null
    })
    expect(first).not.toBeNull()
    expect(first!.right).toBeLessThanOrEqual(375)
    expect(first!.left).toBeGreaterThanOrEqual(0)
  })
})
