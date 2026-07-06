import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('unmatched / malformed routes', () => {
  it('renders a NotFound page for a bogus URL, with a way back', async () => {
    app = await launchApp({ path: '/this-route-does-not-exist' })
    const { page } = app
    await waitForText(page, 'Page not found')
    await waitForText(page, 'Browse Collectibles')
    // The blank-page bug is gone: there's real content, not an empty <main>.
    expect(await page.evaluate(() => document.querySelector('.notfound') !== null)).toBe(true)
  })

  it('renders NotFound for a malformed item deep link (no id segment)', async () => {
    app = await launchApp({ path: '/item/0xabc' })
    const { page } = app
    await waitForText(page, 'Page not found')
  })
})
