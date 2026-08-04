import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { CREATOR_ADDRESS } from './fixtures'

/**
 * Following a creator, and the personalised row it feeds on the overview.
 *
 * Follows are client-side only (a localStorage-backed store, no backend), which makes the interesting
 * part the part a unit test can't see: that the follow survives a page load and that the row on a
 * DIFFERENT page picks it up. A store that persists but keys per-account wrongly, or a row that reads a
 * stale snapshot, both look fine in isolation and broken in the product.
 *
 * The feature is hidden in the release (`dapps-shop-follows` is unset), so these runs pass `follows: true`
 * to reach it at all; the last block covers the state visitors actually get.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const CREATOR_PATH = `/items/creator/${CREATOR_ADDRESS}`

describe('following a creator', () => {
  it('starts unfollowed and flips to Following when pressed', async () => {
    app = await launchApp({ path: CREATOR_PATH, follows: true })
    const { page } = app

    await waitForText(page, 'Galaxy Studio')
    // aria-pressed is the state the button exposes; it is what a screen reader announces. Selected by
    // testid, not by `button[aria-pressed]` — the filter sidebar's rarity chips are toggles too.
    const pressedBefore = await page.$eval('[data-testid="follow-button"]', el => el.getAttribute('aria-pressed'))
    expect(pressedBefore).toBe('false')

    expect(await clickByText(page, 'button', /^follow$/i)).toBe(true)
    await waitForText(page, 'Following')
    expect(await page.$eval('[data-testid="follow-button"]', el => el.getAttribute('aria-pressed'))).toBe('true')
  })

  it('keeps the follow across a full page reload', async () => {
    app = await launchApp({ path: CREATOR_PATH, follows: true })
    const { page } = app

    await waitForText(page, 'Galaxy Studio')
    expect(await clickByText(page, 'button', /^follow$/i)).toBe(true)
    await waitForText(page, 'Following')

    await page.reload({ waitUntil: 'networkidle2' })
    await waitForText(page, 'Following')
  })

  it('unfollows on a second press', async () => {
    app = await launchApp({ path: CREATOR_PATH, follows: true })
    const { page } = app

    await waitForText(page, 'Galaxy Studio')
    expect(await clickByText(page, 'button', /^follow$/i)).toBe(true)
    await waitForText(page, 'Following')
    expect(await clickByText(page, 'button', /^following$/i)).toBe(true)
    await page.waitForFunction(
      () => document.querySelector('[data-testid="follow-button"]')?.getAttribute('aria-pressed') === 'false',
      { timeout: 20000 }
    )
  })

  it('shows the followed-creators row on the overview only once someone is followed', async () => {
    app = await launchApp({ path: '/overview', follows: true })
    const { page } = app

    await waitForText(page, 'Featured Products')
    // Nothing followed yet → the row renders nothing at all (not an empty shell).
    expect(await bodyText(page)).not.toMatch(/creators you follow/i)

    // Follow from the creator page, then come back.
    await page.goto(`${page.url().split('/overview')[0]}${CREATOR_PATH}`, { waitUntil: 'networkidle2' })
    await waitForText(page, 'Galaxy Studio')
    expect(await clickByText(page, 'button', /^follow$/i)).toBe(true)
    await waitForText(page, 'Following')

    expect(await clickByText(page, 'a', /overview/i)).toBe(true)
    await waitForText(page, 'Featured Products')
    expect(await bodyText(page)).toMatch(/creators you follow/i)
  })
})

describe('follows hidden by the unset flag', () => {
  it('shows no Follow button on a creator page', async () => {
    app = await launchApp({ path: CREATOR_PATH })
    const { page } = app

    await waitForText(page, 'Galaxy Studio')
    // The rest of the hero is intact — only the follow affordance is gone.
    expect(await page.$('[data-testid="creator-hero-view"]')).not.toBeNull()
    expect(await page.$('[data-testid="follow-button"]')).toBeNull()
    expect(await bodyText(page)).not.toMatch(/\bfollow\b/i)
  })

  it('shows no followed-creators row on the overview, even with follows already stored', async () => {
    // Signed out so the store reads its anonymous bucket — the key seeded below — instead of the
    // per-account one.
    app = await launchApp({ path: '/overview', signedOut: true })
    const { page } = app

    await waitForText(page, 'Featured Products')
    // A visitor who followed creators in an earlier build still has them in localStorage; seed that and
    // reload, so this covers the stored-set case rather than only the empty one.
    await page.evaluate(
      (key, address) => localStorage.setItem(key, JSON.stringify([address])),
      'shop:followed-creators:v1',
      CREATOR_ADDRESS.toLowerCase()
    )
    await page.reload({ waitUntil: 'networkidle2' })

    await waitForText(page, 'Featured Products')
    expect(await bodyText(page)).not.toMatch(/creators you follow/i)
  })
})
