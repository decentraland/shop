import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { CREATOR_ADDRESS } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('creator storefront', () => {
  it('lists every item made by the creator from /v1/items?creator=', async () => {
    // Creator page reads fetchCreatorItems → GET /v1/items?creator=<address> (mocked from the
    // shopListings fixture, whose items are all created by CREATOR_ADDRESS — a wallet that is NOT the
    // signed-in test user, so the self-purchase guard doesn't hide them).
    app = await launchApp({ path: `/assets/creator/${CREATOR_ADDRESS}` })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')

    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(2)
    await waitForText(page, '2 items')
  })

  it('shows the empty state for a creator with no items', async () => {
    // A different address the fixture has no items for → empty-state copy.
    app = await launchApp({ path: '/assets/creator/0x0000000000000000000000000000000000000abc' })
    const { page } = app

    await waitForText(page, 'This creator has no items to show yet')
    expect(await page.evaluate(() => document.querySelectorAll('.card').length)).toBe(0)
  })
})
