import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('browse with no listings', () => {
  it('renders the empty state on the assets grid', async () => {
    // No unified listings → Assets renders "No items match your filters." (see src/pages/Assets.tsx).
    app = await launchApp({ path: '/assets', fixtures: { unifiedListings: { data: [], total: 0 } } })
    const { page } = app

    await waitForText(page, 'No items match your filters')
    // The grid has no cards.
    expect(await page.evaluate(() => document.querySelectorAll('.card').length)).toBe(0)
  })

  it('renders the overview empty state when there are no drops', async () => {
    // Overview falls back to its own empty block (see src/pages/Overview.tsx).
    app = await launchApp({ path: '/overview', fixtures: { shopListings: { data: [], total: 0 } } })
    const { page } = app

    await waitForText(page, 'New drops are on the way')
    await waitForText(page, 'no items on sale right now')
  })
})
