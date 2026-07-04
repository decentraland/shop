import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('collection storefront', () => {
  it('lists every item of the collection from /v1/items', async () => {
    // Collection page reads fetchCollectionItems → GET /v1/items?contractAddress=<collection>
    // (mocked from the shopListings fixture in helpers/app.ts).
    app = await launchApp({ path: `/collection/${COLLECTION}` })
    const { page } = app

    await waitForText(page, 'Collection')
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')

    // Both items render as real cards (skeletons resolved).
    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(2)
    // The header count reflects the two items.
    await waitForText(page, '2 items')
  })
})
