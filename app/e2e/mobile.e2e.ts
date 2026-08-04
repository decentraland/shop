import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS, buyTrade } from './fixtures'

/**
 * Phone-width smoke over the screens that matter.
 *
 * Two failure modes only ever show up at a real viewport: content that goes missing when a layout
 * collapses, and a page that scrolls SIDEWAYS. The second one is invisible in every other test we have —
 * `document.scrollWidth > clientWidth` is the only cheap, honest assertion for it, and it catches the
 * whole family of "one element is 20px too wide" bugs that otherwise ship.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const PHONE = { width: 375, height: 812 }

/** Launch at phone width and wait for the page to actually have content. */
async function phone(
  path: string,
  anchor: string,
  fixtures?: NonNullable<Parameters<typeof launchApp>[0]>['fixtures']
) {
  app = await launchApp({ path, fixtures })
  const { page } = app
  await page.setViewport(PHONE)
  await waitForText(page, anchor)
  return page
}

/** How far the document can be scrolled horizontally. Anything above a rounding pixel is a bug. */
function overflowPx(page: App['page']) {
  return page.evaluate(() => {
    const d = document.documentElement
    return Math.max(0, Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth)
  })
}

describe('at phone width', () => {
  it('the overview keeps its content and does not scroll sideways', async () => {
    const page = await phone('/overview', 'Featured Products')
    expect(await bodyText(page)).toMatch(/featured products/i)
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the browse grid renders cards and does not scroll sideways', async () => {
    const page = await phone('/items', 'Nebula Jacket')
    // The filter sidebar collapses into a drawer at this width; the cards must survive that.
    expect(await page.$$eval('[data-testid="card"]', els => els.length)).toBeGreaterThan(0)
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the item detail page keeps its price and buy actions', async () => {
    const page = await phone(`/item/${COLLECTION}/1`, 'Nebula Jacket', { trade: buyTrade })
    // Wait for the CTA rather than snapshotting: the buy actions mount after the listing resolves, so a
    // snapshot taken when the NAME appears can legitimately predate them.
    await waitForText(page, 'Buy now')

    // Add-to-cart is asserted by ACCESSIBLE NAME, not by text. At this width it collapses to an icon with
    // its label hidden, so it is absent from innerText while still being present and usable — matching on
    // text would fail for a layout that is actually correct, and would miss a missing aria-label.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button, a')].some(
          el => /add to cart/i.test(el.getAttribute('aria-label') ?? '') && !!(el as HTMLElement).offsetParent
        ),
      { timeout: 20000 }
    )
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  // The sticky bottom bar is for actions. A not-for-sale item you don't own has none: notify-me hides itself
  // while shop-server is unconfigured, and the "coming soon" offer button no longer renders at all (there are
  // no secondary sales yet). So the bar must not pin itself over the page.
  //
  // Re-anchored: this used to wait for the offer button and walk up to its container. With that button gone
  // the wait timed out, even though the invariant it guards became MORE true rather than less. It now asserts
  // the absence directly — no pinned block anywhere on the surface — which is what the test was always about.
  it('does not pin the action bar for a not-for-sale item with nothing actionable in it', async () => {
    // A token owned by someone ELSE, with no listing: the buyer's not-for-sale surface. Ownership is
    // resolved from the owned-tokens lookup, so that has to be empty for the viewer not to be the owner.
    const foreignToken = {
      data: [
        {
          nft: {
            id: `${COLLECTION}-42`,
            contractAddress: COLLECTION,
            tokenId: '42',
            itemId: '0',
            name: 'Galaxy Hat #42',
            category: 'wearable',
            image: '',
            owner: CREATOR_ADDRESS,
            network: 'MATIC',
            chainId: 80002,
            data: { wearable: { rarity: 'epic' } }
          },
          order: null
        }
      ],
      total: 1
    }
    const page = await phone(`/token/${COLLECTION}/42`, 'Galaxy Hat', {
      ownedNfts: { data: [], total: 0 },
      publicNfts: foreignToken,
      trade: null
    })
    await waitForText(page, 'Not for sale')

    const bar = await page.evaluate(() => {
      const block = document.querySelector('[data-buttons]') as HTMLElement | null
      return {
        pinned: !!block,
        position: block ? getComputedStyle(block).position : null
      }
    })
    expect(bar.pinned, 'nothing is actionable, so no CTA block should carry data-buttons').toBe(false)
    // And the offer button really is gone, not merely unpinned.
    expect(await page.$('[data-testid="make-offer"]')).toBeNull()
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the cart keeps its summary reachable', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app
    await page.setViewport(PHONE)
    await waitForText(page, 'Nebula Jacket')

    const added = await page.$$eval('button', els => {
      const b = els.find(x => /add to cart/i.test(x.textContent ?? ''))
      b?.click()
      return !!b
    })
    expect(added).toBe(true)
    await waitForText(page, 'successfully added to cart')
    await page.goto(page.url().replace(`/item/${COLLECTION}/1`, '/cart'), { waitUntil: 'networkidle2' })

    await waitForText(page, 'Purchase Summary')
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the credits page renders its packs', async () => {
    const page = await phone('/credits', 'Get')
    expect(await page.$$eval('[data-testid="pack"]', els => els.length)).toBeGreaterThan(0)
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the activity page renders', async () => {
    const page = await phone('/activity', 'Activity')
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })
})
