import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy with insufficient funds', () => {
  it('surfaces an error and does NOT navigate to /success when authorize fails (402)', async () => {
    // Deep-link the secondary item; force the credits-server authorize step to 402 (insufficient
    // funds). ItemDetail.handleBuyNow catches the thrown error, releases the intent and setError(...).
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // The friendly insufficient-funds error renders (friendlyError matches "insufficient").
    await waitForText(page, "don't have enough")

    // Crucially, checkout did NOT succeed → we stay on the item page, never /success.
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
    expect(await page.evaluate(() => window.location.pathname === '/success')).toBe(false)
  })
})
