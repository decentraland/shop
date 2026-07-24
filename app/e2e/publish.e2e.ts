import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('publish a created item (primary)', () => {
  it('publishes a creation for sale from its item detail page', async () => {
    // No importable listings → no banner. Empty shop catalog too: an UNPUBLISHED creation isn't for sale
    // yet, so it must NOT resolve as a catalog listing — otherwise the item detail would overwrite the
    // creator (the browse catalog's `creator` is a third party) and stop recognizing you as the creator.
    // The creation still shows under "My Creations" (that grid reads the builder feed, not the catalog).
    app = await launchApp({ path: '/my-assets', fixtures: { importable: { data: [] }, shopListings: { data: [] } } })
    const { page } = app

    // Redesigned My Assets: creations live behind the sidebar "My Creations" section. Land on the owned
    // grid, then switch sections.
    await waitForText(page, 'Galaxy Hat')
    expect(await clickByText(page, 'button', /my creations/i)).toBe(true)
    await waitForText(page, 'Galaxy Hat')

    // Publishing no longer happens inline from the My Creations card — its ONLY action is a MANAGE cta
    // (hover-revealed, clickable via DOM text) that opens the item detail page, where the creator's
    // "Put up for sale" lives.
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)
    await waitForText(page, 'Put up for sale')

    // Open the publish modal from the detail page. The CTA is disabled until the creator's builder
    // record (publishableItem) resolves, so wait for it to be ENABLED before clicking — a plain click on
    // a still-disabled button is a no-op and the modal would never open.
    await clickWhenEnabled(page, 'button', /put up for sale/i)
    // …the collection resolves already-enabled (mocked) → confirm with "Put on sale".
    await clickWhenEnabled(page, '[data-testid="modal"] button', /put on sale/i)

    // Success view.
    await waitForText(page, 'on sale!')
    expect(await page.evaluate(() => /on sale!/i.test(document.body.innerText))).toBe(true)
  })
})
