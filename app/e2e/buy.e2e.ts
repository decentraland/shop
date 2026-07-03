import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy an item with credits', () => {
  it('goes item detail → Buy now → success', async () => {
    // Deep-link the secondary item (Nebula Jacket, itemId 1). authorize is mocked; the useCredits
    // "tx" is submitted through the mock wallet (eth_sendTransaction → canned hash → success receipt).
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // On success the app navigates to /success.
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    expect(await page.evaluate(() => window.location.pathname)).toBe('/success')
  })
})
