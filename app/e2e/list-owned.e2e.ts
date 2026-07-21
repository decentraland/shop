import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('list an owned item (secondary)', () => {
  it('lists an owned wearable for sale in the Shop', async () => {
    app = await launchApp({ path: '/my-assets', fixtures: { importable: { data: [] } } })
    const { page } = app

    await waitForText(page, 'Items you own')
    await waitForText(page, 'Galaxy Hat #42')

    // Open the sell modal from the owned card…
    expect(await clickByText(page, 'button', /put on sale/i)).toBe(true)
    // …then confirm the listing in the modal.
    await clickWhenEnabled(page, '[data-testid="modal"] button', /put on sale/i)

    await waitForText(page, 'on sale!')
    expect(await page.evaluate(() => /on sale!/i.test(document.body.innerText))).toBe(true)
  })
})
