import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('favorite an item', () => {
  it('a favorited item shows up in My Favorites', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Heart the first card.
    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.click('[data-testid="card-fav"]')

    // It persists (localStorage) → shows on the favorites page after navigating.
    await page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText.includes('Galaxy Hat'))).toBe(true)
  })
})
