import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('browse when the catalog fetch fails', () => {
  it('surfaces an error message instead of the grid', async () => {
    // Force /v3/catalog/shop → 500. fetchListings throws → Assets renders <p class="error"> with the
    // message ("fetchShopListings 500"). See src/lib/api.ts + src/pages/Assets.tsx.
    app = await launchApp({ path: '/assets', errors: { '/v3/catalog/shop': { status: 500 } } })
    const { page } = app

    await page.waitForSelector('.error', { timeout: 20000 })
    await waitForText(page, 'fetchShopListings 500')

    // The grid never populated with real cards.
    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(0)
  })
})
