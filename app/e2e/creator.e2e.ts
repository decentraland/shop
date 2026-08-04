import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS, shopListings } from './fixtures'

// Where a card's artwork actually lands: the image element's box against the media box that clips it,
// plus what object-fit paints inside that box. jsdom has no layout, so framing can only be checked here.
const FRAME_PROBE = `(cardSel) => {
  const card = document.querySelector(cardSel)
  const media = card.firstElementChild
  const img = card.querySelector('[data-testid="coll-thumb-cell"] img, [data-testid="card-img"], img')
  const mediaBox = media.getBoundingClientRect()
  const imgBox = img.getBoundingClientRect()
  const cs = getComputedStyle(img)
  const pad = parseFloat(cs.paddingTop) || 0
  const inW = img.clientWidth - 2 * (parseFloat(cs.paddingLeft) || 0)
  const inH = img.clientHeight - 2 * pad
  const nw = img.naturalWidth || 1
  const nh = img.naturalHeight || 1
  const scale = cs.objectFit === 'cover' ? Math.max(inW / nw, inH / nh) : Math.min(inW / nw, inH / nh)
  return {
    fit: cs.objectFit,
    media: [Math.round(mediaBox.width), Math.round(mediaBox.height)],
    imgBox: [Math.round(imgBox.width), Math.round(imgBox.height)],
    painted: [Math.round(nw * scale), Math.round(nh * scale)],
    clippedTop: Math.round(Math.max(0, mediaBox.top - imgBox.top)),
    clippedBottom: Math.round(Math.max(0, imgBox.bottom - mediaBox.bottom))
  }
}`

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('creator storefront', () => {
  it('shows the hero and lists every item the creator published, from /v3/catalog/items?creator=', async () => {
    // Creator page reads fetchCatalogItems → GET /v3/catalog/items?creator=<address> (mocked from the
    // shopListings fixture, whose items are all created by CREATOR_ADDRESS — a wallet that is NOT the
    // signed-in test user, so the self-purchase guard doesn't hide them). That feed is the FULL catalog,
    // listed or not; the old /v3/catalog/shop source only knew shop-native listings. The hero
    // name/description come from the mocked profile + store entity.
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

    // Grid: the creator's two items, and a count that agrees with it.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(2)
    await waitForText(page, '2 items')
  })

  it('puts the rarity and price filters in the left sidebar, not in a top dropdown row', async () => {
    app = await launchApp({ path: `/items/creator/${CREATOR_ADDRESS}` })
    const { page } = app
    await page.waitForSelector('[data-testid="creator-sidebar"]')

    const inSidebar = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="creator-sidebar"]') as HTMLElement
      return {
        rarity: !!sidebar.querySelector('[data-testid="rarity-filter"]'),
        price: !!sidebar.querySelector('input[type="range"]'),
        // The toolbar keeps only the count + Sort By (+ the mobile Filters pill).
        toolbarTriggers: document.querySelectorAll('[data-testid="browse-toolbar"] button').length
      }
    })
    expect(inSidebar.rarity).toBe(true)
    expect(inSidebar.price).toBe(true)
    // Sort By + the mobile Filters pill only — no Rarity/Price dropdowns left in the bar.
    expect(inSidebar.toolbarTriggers).toBeLessThanOrEqual(2)
  })

  it('says the creator has published nothing only when that is actually true', async () => {
    // A different address the fixture has no items for → the "published nothing" copy, which is a
    // different claim from "no items match your filters" (that one names the creator's real item count).
    app = await launchApp({ path: '/items/creator/0x0000000000000000000000000000000000000abc' })
    const { page } = app

    await waitForText(page, 'This creator hasn’t published anything yet')
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="card"]').length)).toBe(0)
  })

  // A collection has no artwork of its own, so its cover is a mosaic of its items' thumbnails. A cover
  // holding ONE item gives that mosaic a single cell as wide as the cover and only two-thirds as tall —
  // the case where the cell used to take the image's own square height, overflow the cover and lose the
  // top and bottom of the artwork. Framed the way AssetCard frames an item thumbnail: contained, whole,
  // centred, nothing clipped.
  it('frames a collection cover the way an item card frames its thumbnail, with nothing clipped', async () => {
    const oneItem = { data: [(shopListings as { data: unknown[] }).data[0]], total: 1 }
    app = await launchApp({
      path: `/items/creator/${CREATOR_ADDRESS}?collections`,
      fixtures: {
        shopListings: oneItem,
        collections: {
          data: [{ contractAddress: COLLECTION, name: 'Solo', creator: CREATOR_ADDRESS, size: 1 }],
          total: 1
        }
      }
    })
    const { page } = app
    await page.waitForSelector('[data-testid="coll-card"] img')
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="coll-card"] img') as HTMLImageElement | null
      return !!img?.complete && img.naturalWidth > 0
    })

    const frame: {
      fit: string
      media: [number, number]
      imgBox: [number, number]
      painted: [number, number]
      clippedTop: number
      clippedBottom: number
    } = await page.evaluate(`(${FRAME_PROBE})('[data-testid="coll-card"]')` as never)

    expect(frame).toMatchObject({ fit: 'contain', clippedTop: 0, clippedBottom: 0 })
    // The image element must not be taller than the box that clips it — the actual defect.
    expect(frame.imgBox[1]).toBeLessThanOrEqual(frame.media[1])
    // And what gets painted must fit inside that box in both axes.
    expect(frame.painted[0]).toBeLessThanOrEqual(frame.imgBox[0])
    expect(frame.painted[1]).toBeLessThanOrEqual(frame.imgBox[1])
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
