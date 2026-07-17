import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('browse when the catalog fetch fails', () => {
  it('surfaces a friendly error (not the raw fetch message) instead of the grid', async () => {
    // Force /v3/catalog/unified → 500. fetchUnified throws → Assets renders <p class="error"> with a
    // generic web2 message — never the raw "fetchUnified 500". See src/pages/Assets.tsx.
    app = await launchApp({ path: '/assets', errors: { '/v3/catalog/unified': { status: 500 } } })
    const { page } = app

    await page.waitForSelector('[data-testid="browse-error"]', { timeout: 20000 })
    await waitForText(page, 'load items')

    // The raw fetch error must NOT leak to the user (web2 convention).
    expect(await bodyText(page)).not.toContain('fetchUnified')

    // The grid never populated with real cards.
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(0)
  })
})
