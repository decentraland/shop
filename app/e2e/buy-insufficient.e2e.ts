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
  it('opens the Buy Credits and Item state (pack picker) and never navigates to /success', async () => {
    // Deep-link the secondary item; force the credits-server authorize step to 402 (insufficient
    // funds). The buy modal treats that as "not enough credits" and shows the top-up pack picker
    // instead of a bare error — no dollars are reserved, no purchase happens.
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // The modal reaches the no-funds state: header + insufficient-funds warning.
    await waitForText(page, 'Buy Credits and Item')
    await waitForText(page, 'Insufficient Funds')

    // Checkout never succeeded → we stay on the item page, never /success.
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
  })
})
