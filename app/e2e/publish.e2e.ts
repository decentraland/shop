import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('publish a created item (primary)', () => {
  it('lists a creation for sale in the Shop', async () => {
    // No importable listings → no banner; a published collection item is available under "Your creations".
    app = await launchApp({ path: '/my-assets', fixtures: { importable: { data: [] } } })
    const { page } = app

    // Session restored (else My Assets shows a sign-in prompt) + the creation shows.
    await waitForText(page, 'Your creations')
    await waitForText(page, 'Galaxy Hat')

    // Open the publish modal.
    expect(await clickByText(page, 'button', /put on sale/i)).toBe(true)

    // The modal resolves "already enabled" (mocked) → the CTA becomes "Put on sale". Publish.
    await clickWhenEnabled(page, '[data-testid="modal"] button', /put on sale/i)

    // Success view.
    await waitForText(page, 'on sale!')
    expect(await page.evaluate(() => /on sale!/i.test(document.body.innerText))).toBe(true)
  })
})
