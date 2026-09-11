import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('favorite an item', () => {
  it('signed in: a favorited item persists server-side and shows up in My Favorites', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Heart the first card.
    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.click('[data-testid="card-fav"]')

    // The pick is written to the favorites service → the favorites page re-reads it from there
    // (picks list → catalog hydration) after navigating.
    await page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText.includes('Galaxy Hat'))).toBe(true)
  })

  it('signed out: a favorited item persists locally and shows up in My Favorites', async () => {
    app = await launchApp({ path: '/items', signedOut: true })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.click('[data-testid="card-fav"]')

    // No session → localStorage bucket; still there after navigating.
    await page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText.includes('Galaxy Hat'))).toBe(true)
  })

  it("the item page shows how many people saved it, and the viewer's own save raises it", async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Two saves by other accounts (the mock picks service), none by the viewer yet.
    await page.waitForSelector('[data-testid="fav-count"]', { timeout: 15000 })
    const count = () => page.$eval('[data-testid="fav-count"]', el => el.textContent?.trim())
    expect(await count()).toBe('2')

    await page.click('[data-fav-title]')
    await page.waitForFunction(() => document.querySelector('[data-testid="fav-count"]')?.textContent?.trim() === '3', {
      timeout: 15000
    })
    expect(await count()).toBe('3')
  })
})
