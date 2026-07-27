import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/**
 * The SHIPPED default: the Shop offers no secondary sales.
 *
 * Every other resale spec runs with the flag on, so without this one the default configuration — the one
 * that will actually be in production — would be the only state nothing covers. And the failure it guards
 * against is silent: a Sell button that reappears looks like a working feature, not like a bug.
 */
describe('with secondary sales off (the shipped default)', () => {
  it('should not offer to list an owned token for sale', async () => {
    app = await launchApp({ path: '/my-assets', secondarySales: false, fixtures: { importable: { data: [] } } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat #42')
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)

    // The owner still reaches their token's page — they just cannot put it up for sale from the Shop.
    await waitForText(page, 'Galaxy Hat')
    expect(await bodyText(page)).not.toMatch(/put up for sale/i)
  })

  // NOTE: that the browse grid asks the server for `listingType=primary` is asserted in lib/api.spec.ts
  // instead. It is a wire-format guarantee, and requests fulfilled through CDP interception do not reliably
  // show up in the page's resource timing, so checking it here would test the harness, not the app.
})
