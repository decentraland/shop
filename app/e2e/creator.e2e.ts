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
  it('shows the hero and lists the creator credit-buyable listings from /v3/catalog/shop?creator=', async () => {
    // Creator page reads fetchListings → GET /v3/catalog/shop?creator=<address> (mocked from the
    // shopListings fixture, whose items are all created by CREATOR_ADDRESS — a wallet that is NOT the
    // signed-in test user, so the self-purchase guard doesn't hide them). The hero name/description
    // come from the mocked profile + store entity.
    app = await launchApp({ path: `/assets/creator/${CREATOR_ADDRESS}` })
    const { page } = app

    // Hero: creator name (profile) + store description + View profile link out to the DCL profile.
    await waitForText(page, 'Galaxy Studio')
    await waitForText(page, 'Handcrafted wearables & emotes.')
    const profileHref = await page.evaluate(
      () => document.querySelector('.creator-hero__view')?.getAttribute('href') ?? ''
    )
    expect(profileHref).toContain('/profile/')
    expect(profileHref).toContain(CREATOR_ADDRESS)

    // Grid: the creator's two listings, from the shop feed.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(2)
    await waitForText(page, '2 items')
  })

  it('shows the empty state for a creator with no items', async () => {
    // A different address the fixture has no items for → empty-state copy. No store entity either,
    // so the hero renders with the bundled default cover (still shows the shortened address as name).
    app = await launchApp({ path: '/assets/creator/0x0000000000000000000000000000000000000abc' })
    const { page } = app

    await waitForText(page, 'This creator has no items to show yet')
    expect(await page.evaluate(() => document.querySelectorAll('.card').length)).toBe(0)
  })
})
