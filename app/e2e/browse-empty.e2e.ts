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
    // No unified listings → Assets renders its zero-results card (Figma empty state, see
    // src/pages/Assets.tsx): "Oops! Nothing found." + the filters variant of the body + "Explore Shop".
    app = await launchApp({ path: '/assets', fixtures: { unifiedListings: { data: [], total: 0 } } })
    const { page } = app

    await waitForText(page, 'Oops! Nothing found.')
    await waitForText(page, 'Explore Shop')
    // The grid has no cards.
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(0)
  })

  it('renders the overview empty state when there are no drops', async () => {
    // Overview falls back to its own empty block (see src/pages/Overview.tsx).
    app = await launchApp({ path: '/overview', fixtures: { shopListings: { data: [], total: 0 } } })
    const { page } = app

    await waitForText(page, 'New drops are on the way')
    await waitForText(page, 'no items on sale right now')
  })
})
