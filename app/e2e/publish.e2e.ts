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
    // No importable listings → no banner; a published collection item is available under "My Creations".
    app = await launchApp({ path: '/my-assets', fixtures: { importable: { data: [] } } })
    const { page } = app

    // Redesigned My Assets: creations no longer have a "Your creations" heading — they live behind the
    // sidebar "My Creations" section. Land on the owned grid, then switch sections.
    await waitForText(page, 'Galaxy Hat')
    expect(await clickByText(page, 'button', /my creations/i)).toBe(true)

    // The creation (builder feed) shows in the Creations grid.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Put on sale')

    // Open the publish modal.
    expect(await clickByText(page, 'button', /put on sale/i)).toBe(true)

    // The modal resolves "already enabled" (mocked) → the CTA becomes "Put on sale". Publish.
    await clickWhenEnabled(page, '[data-testid="modal"] button', /put on sale/i)

    // Success view.
    await waitForText(page, 'on sale!')
    expect(await page.evaluate(() => /on sale!/i.test(document.body.innerText))).toBe(true)
  })
})
