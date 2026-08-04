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
    app = await launchApp({ path: `/items/creator/${CREATOR_ADDRESS}` })
    const { page } = app

    // Hero: creator name (profile) + store description + View profile link out to the DCL profile.
    await waitForText(page, 'Galaxy Studio')
    await waitForText(page, 'Handcrafted wearables & emotes.')
    const profileHref = await page.evaluate(
      () => document.querySelector('[data-testid="creator-hero-view"]')?.getAttribute('href') ?? ''
    )
    expect(profileHref).toContain('/profile/')
    expect(profileHref).toContain(CREATOR_ADDRESS)

    // Hero social links: the store's three configured links render as icon buttons linking out.
    const linkHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="creator-hero-link"]')).map(a => a.getAttribute('href'))
    )
    expect(linkHrefs).toEqual(['https://galaxy.example', 'https://www.twitter.com/galaxy', 'https://discord.gg/galaxy'])

    // Grid: the creator's two listings, from the shop feed.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(2)
    await waitForText(page, '2 items')
  })

  it('shows the empty state for a creator with no items', async () => {
    // A different address the fixture has no items for → empty-state copy. No store entity either,
    // so the hero renders with the bundled default cover (still shows the shortened address as name).
    app = await launchApp({ path: '/items/creator/0x0000000000000000000000000000000000000abc' })
    const { page } = app

    await waitForText(page, 'This creator has no items to show yet')
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(0)
  })

  // Hovering a collection card must swap the creator/count row for the View action IN PLACE — the card
  // used to grow the button below the row, which shrank the cover.
  it('swaps the creator row for View collection on hover, without moving anything else', async () => {
    app = await launchApp({ path: `/items/creator/${CREATOR_ADDRESS}?collections` })
    const { page } = app
    await page.waitForSelector('[data-testid="coll-card"]')

    const read = () =>
      page.evaluate(() => {
        const card = document.querySelector('[data-testid="coll-card"]') as HTMLElement
        const vis = (sel: string) =>
          getComputedStyle(card.querySelector(sel) as HTMLElement).visibility as 'visible' | 'hidden'
        return {
          card: Math.round(card.getBoundingClientRect().height),
          // The cover: whatever the button used to steal space from.
          cover: Math.round((card.firstElementChild as HTMLElement).getBoundingClientRect().height),
          meta: vis('[data-testid="coll-card-meta"]'),
          view: vis('[data-testid="coll-card-view"]')
        }
      })

    const atRest = await read()
    expect(atRest.meta).toBe('visible')
    expect(atRest.view).toBe('hidden')

    // The swap is gated on `@media (hover: hover)`, which Chromium derives from the OS's input
    // devices and offers no override for (blink-settings and CDP media emulation are both ignored).
    // Headless on macOS always reports a hovering pointer; headless in a Linux CI container reports
    // none. Assert whichever contract applies: hover swaps the row in place, no-hover leaves it alone.
    const canHover = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    await page.hover('[data-testid="coll-card"]')
    const hovered = await read()
    expect(hovered.meta).toBe(canHover ? 'hidden' : 'visible')
    expect(hovered.view).toBe(canHover ? 'visible' : 'hidden')
    // Same card, same cover height — the swap happens inside one slot (and a no-hover
    // pointer must not move anything either).
    expect(hovered.card).toBe(atRest.card)
    expect(hovered.cover).toBe(atRest.cover)
  })
})
