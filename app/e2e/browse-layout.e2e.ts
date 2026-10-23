import { describe, it, expect, afterEach } from 'vitest'
import type { ElementHandle, Page } from 'puppeteer'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import * as fx from './fixtures'

// The bubble fades AND slides into place over 0.14s, so its box is only meaningful once that settles.
// Opacity and transform share the transition, so full opacity means the slide has landed too.
async function openTooltip(page: Page, x: number, y: number): Promise<void> {
  // Two moves: the first parks the pointer elsewhere so the second produces a mouseover on the trigger.
  await page.mouse.move(x - 60, y - 60)
  await page.mouse.move(x, y)
  await page.waitForSelector('[role="tooltip"][data-open]')
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('[role="tooltip"][data-open]')!).opacity === '1'
  )
}

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// Regression guards for the browse (Collectibles) toolbar + grid layout. These caught two real bugs:
// a duplicated result count in the toolbar, and mobile cards overflowing the viewport (the card body
// grid was missing `display: grid`). Cheap structural assertions — no pixel comparisons.

/**
 * Where the resting tags row sits: the rarity tag and the price must both be visible, side by side on one
 * row under the creator, and inside the card's own box. Measured from the handles, so a hidden element
 * (no box) reads as not shown.
 */
async function tagsRowOf(card: ElementHandle<Element>) {
  const box = async (sel: string) => (await card.$(sel))?.boundingBox() ?? null
  const [tag, price, author, frame] = await Promise.all([
    box('[data-testid="chip-rarity"]'),
    box('[data-testid="card-price"]'),
    box('[data-testid="card-author"]'),
    card.boundingBox()
  ])
  if (!tag || !price || !author || !frame)
    return { bothShown: false, sameRow: false, priceRightOfTag: false, belowCreator: false, insideCard: false }
  const mid = (b: { y: number; height: number }) => b.y + b.height / 2
  return {
    bothShown: tag.width > 0 && price.width > 0,
    sameRow: Math.abs(mid(tag) - mid(price)) <= 6,
    priceRightOfTag: price.x >= tag.x + tag.width,
    belowCreator: tag.y >= author.y + author.height && price.y >= author.y + author.height,
    insideCard:
      tag.x >= frame.x &&
      price.x + price.width <= frame.x + frame.width + 0.5 &&
      price.y + price.height <= frame.y + frame.height
  }
}

describe('collectibles browse layout', () => {
  it('renders exactly one result count in the toolbar', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'Items')
    const counts = await page.$$eval('[data-testid="browse-count"]', els => els.length)
    expect(counts).toBe(1)
  })

  it('does not overflow horizontally on a mobile viewport', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })
    await waitForText(page, 'Items')
    // The grid must fit the viewport (the card-body grid regression pushed cards off-screen).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
    // And a card's own content must not overflow its frame (the name/price row clipped the price).
    const cardOverflow = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="card"]') as HTMLElement | null
      return c ? c.scrollWidth > c.clientWidth + 1 : false
    })
    expect(cardOverflow).toBe(false)
  })

  // One layout per breakpoint: however long the name, a desktop card keeps the ordinary footer — an
  // ellipsised name, the creator under it, then the tags with the price on their right, and the
  // full-width Add to cart (the round action belongs to the mobile layout).
  it('keeps a long-named card on the ordinary desktop layout (no per-card stacking)', async () => {
    const rows = (fx.unifiedListings as { data: Record<string, unknown>[] }).data
    const long = 'Asset Name Asset Name Asset Name Asset Name'
    app = await launchApp({
      path: '/items',
      fixtures: { unifiedListings: { data: [rows[1], { ...rows[0], name: long }] } }
    })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForSelector('[data-testid="card-cart"]')

    const handles = await page.$$('[data-testid="card"]')
    const cards = await Promise.all(
      handles.map(async el => ({
        name: await el.$eval('[data-testid="card-link"]', l => l.getAttribute('aria-label') ?? ''),
        roundShown: await el
          .$eval('[data-testid="card-add-round"]', r => getComputedStyle(r).display !== 'none')
          .catch(() => false),
        ...(await tagsRowOf(el))
      }))
    )

    expect(cards.length).toBe(2)
    for (const card of cards) {
      expect(card.roundShown, card.name).toBe(false)
      expect(card.bothShown, card.name).toBe(true)
      expect(card.sameRow, card.name).toBe(true)
      expect(card.priceRightOfTag, card.name).toBe(true)
      expect(card.belowCreator, card.name).toBe(true)
      expect(card.insideCard, card.name).toBe(true)
    }
  })

  // ...and a name that overflows its row must NOT restructure the card. The regression was a real catalogue
  // name that wanted a few pixels more than its row had, and that was enough to move its price, reshape its
  // action and drop its tags — one odd card in a grid of 48. The name box ellipsises, so overflowing it must
  // cost nothing but the ellipsis. The name now has the row to itself, so it takes a longer one to overflow.
  it('keeps a name that overflows its row inline, tags and all', async () => {
    const rows = (fx.unifiedListings as { data: Record<string, unknown>[] }).data
    const snug = 'Midnight Black Tuxedo Trousers With Satin Side Stripe'
    app = await launchApp({
      path: '/items',
      fixtures: { unifiedListings: { data: [rows[1], { ...rows[0], name: snug }] } }
    })
    const { page } = app
    await waitForText(page, snug)
    // The measurement re-runs when the webfont swaps in, so settle before asserting on it.
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForSelector('[data-testid="card-cart"]')

    const handle = (
      await Promise.all(
        (await page.$$('[data-testid="card"]')).map(async el => ({
          el,
          name: await el.$eval('[data-testid="card-link"]', l => l.getAttribute('aria-label') ?? '')
        }))
      )
    ).find(c => c.name === snug)!.el
    const card = {
      ...(await handle.evaluate(el => {
        const span = el.querySelector('[title]')?.querySelector('span') as HTMLElement
        const roundEl = el.querySelector<HTMLElement>('[data-testid="card-add-round"]')
        return {
          // The round action is always in the DOM (CSS reveals it per layout), so presence proves nothing —
          // what matters is that this card does not SHOW it.
          roundShown: !!roundEl && getComputedStyle(roundEl).display !== 'none',
          // Proof the name really does overflow its box, so this test cannot pass for the wrong reason.
          overflows: span.offsetWidth > (span.closest('[title]') as HTMLElement).clientWidth
        }
      })),
      ...(await tagsRowOf(handle))
    }

    // The card keeps the ordinary layout: no round action, tags and price on their own row.
    expect(card.overflows).toBe(true)
    expect(card.roundShown).toBe(false)
    expect(card.bothShown).toBe(true)
    expect(card.sameRow).toBe(true)
    expect(card.insideCard).toBe(true)
  })

  // The filter sidebar scrolls internally, and overflow clips BOTH axes — an absolutely-positioned
  // tooltip inside it lost its first word off the left edge. The bubble is portalled to <body> now.
  it('shows the whole SMART hint tooltip, not cropped by the filter sidebar', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'SMART')

    const anchor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="smart-hint"]') as HTMLElement | null
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    expect(anchor).not.toBeNull()
    await openTooltip(page, anchor!.x, anchor!.y)

    const fit = await page.evaluate(() => {
      const bubble = document.querySelector('[role="tooltip"][data-open]') as HTMLElement
      const b = bubble.getBoundingClientRect()
      // Every clipping ancestor the bubble now has to survive.
      let clipped = false
      for (let el = bubble.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el)
        if (!/auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY)) continue
        const c = el.getBoundingClientRect()
        if (b.left < c.left - 1 || b.right > c.right + 1) clipped = true
      }
      return {
        clipped,
        inViewport: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight,
        text: bubble.textContent
      }
    })
    expect(fit.text).toMatch(/smart wearables add/i)
    expect(fit.clipped).toBe(false)
    expect(fit.inViewport).toBe(true)
  })

  // A fixed bubble that lands off-screen cannot be scrolled to, so it must flip/clamp instead. The SMART
  // hint opens downwards and its trigger sits at the bottom of a scrolled filter sidebar.
  it('keeps the tooltip on screen when its trigger is near the bottom of the viewport', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await page.setViewport({ width: 1280, height: 620 })
    await waitForText(page, 'SMART')

    const anchor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="smart-hint"]') as HTMLElement | null
      if (!el) return null
      // Push the trigger as low as the sidebar's own scroll allows.
      el.scrollIntoView({ block: 'end' })
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, viewport: window.innerHeight }
    })
    expect(anchor).not.toBeNull()
    await openTooltip(page, anchor!.x, anchor!.y)

    const box = await page.evaluate(() => {
      const b = document.querySelector('[role="tooltip"][data-open]')!.getBoundingClientRect()
      return { top: b.top, bottom: b.bottom, viewport: window.innerHeight }
    })
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(box.viewport)
  })
})
