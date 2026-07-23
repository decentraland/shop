import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('list an owned item (secondary) from its detail page', () => {
  it('opens an owned wearable from My Assets via MANAGE and lists it for sale', async () => {
    app = await launchApp({ path: '/my-assets', fixtures: { importable: { data: [] } } })
    const { page } = app

    // Redesigned My Assets: the owned wearables grid is the default section, and each owned card's ONLY
    // action is a MANAGE cta — listing no longer happens inline from My Assets, it moved to the detail
    // page. Wait for the owned card (keyed by its item name); the MANAGE cta is a hover-revealed control
    // (display:none at rest) so it's clickable via its DOM text even before it's painted.
    await waitForText(page, 'Galaxy Hat #42')

    // MANAGE → the item detail page for this exact token, where "List for sale" lives.
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)
    await waitForText(page, 'List for sale')

    // Open the sell modal from the detail page…
    expect(await clickByText(page, 'button', /list for sale/i)).toBe(true)
    // …then confirm the listing in the modal.
    await clickWhenEnabled(page, '[data-testid="modal"] button', /put on sale/i)

    await waitForText(page, 'on sale!')
    expect(await page.evaluate(() => /on sale!/i.test(document.body.innerText))).toBe(true)
  })
})
