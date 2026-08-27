import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickWhenEnabled, waitForText } from './helpers/dom'
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
    const page = await phone('/overview', 'Trending Products')
    expect(await bodyText(page)).toMatch(/trending products/i)
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

  /**
   * The stacked navbar keeps the heart and the cart against the right edge WITHOUT the credits CTA.
   *
   * Only a real viewport can see this. The stacked row's single auto margin used to sit on the CTA, so
   * hiding the CTA inside the iOS web view took the right alignment with it and both icons collapsed against
   * the left edge. jsdom has no layout, so no unit test can catch it — this is the assertion that can.
   *
   * Measured against the SUB-NAV's own content edge — its right border less its right padding. This used to
   * measure against the search field, which shared that edge for free while the field had a row to itself.
   * It no longer does: the field now sits IN this row (it took the hidden CTA's slot), with the favourites
   * and the cart to its right, so the field's edge is ~109px short of the container's and says nothing about
   * where the cart is. Reading the padding off the element keeps the breakpoint's value out of this file.
   */
  it('keeps the cart pinned right in the iOS web view, where the credits CTA is hidden', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending Products')

    // The CTA is the thing being removed — if it is still here the alignment proves nothing.
    expect(await page.$$eval('a[href="/credits"]', els => els.length)).toBe(0)

    const drift = await page.evaluate(() => {
      const cart = document.querySelector('[data-testid="subnav-cart"]')
      const subnav = document.querySelector('[data-testid="subnav"]')
      if (!cart || !subnav) return null
      const padRight = parseFloat(getComputedStyle(subnav).paddingRight) || 0
      return Math.abs(subnav.getBoundingClientRect().right - padRight - cart.getBoundingClientRect().right)
    })

    expect(drift).not.toBeNull()
    // A few px of slack for the icon button's own padding; the bug parked it hundreds of px away.
    expect(drift!).toBeLessThanOrEqual(24)
  })

  /**
   * The search field takes the slot the credits CTA left, rather than keeping the row of its own it has on
   * the web (Figma 2703:399357): search, favourites and cart on ONE line, tabs below.
   *
   * Sharing a row is a layout fact, so only a real viewport can assert it — hence a row-membership check
   * (same vertical band as the cart) rather than a class or a style assertion, which would pass just as
   * happily with the field still parked on its own line.
   */
  it('lifts the search field into the cart row inside the iOS web view', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending Products')

    const sameRow = await page.evaluate(() => {
      const cart = document.querySelector('[data-testid="subnav-cart"]')
      const field = document.querySelector('[data-testid="subnav"] input[placeholder]')
      if (!cart || !field) return null
      const a = cart.getBoundingClientRect()
      const b = field.getBoundingClientRect()
      // Centres within half a row of each other — two stacked rows are a full row-height apart.
      return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 20
    })

    expect(sameRow).toBe(true)
  })

  /**
   * The field holds the design's 196px and does NOT stretch to meet the icons (2699:386161).
   *
   * Left to grow it runs the whole way across and swallows the gap the design draws between it and the
   * favourites — which is what it did on the first pass here, and what made the row read as "not the
   * design" even though every element was present and in the right order. Only a real viewport can tell
   * a field that fills its row from one that stops.
   */
  it('holds the design width in the iOS web view instead of stretching to the icons', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending Products')

    const box = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="subnav"] input[placeholder]') as HTMLInputElement | null
      const fav = document.querySelector('a[href="/my-favorites"]')
      if (!input?.parentElement || !fav) return null
      const field = input.parentElement.getBoundingClientRect()
      return { width: Math.round(field.width), slack: Math.round(fav.getBoundingClientRect().left - field.right) }
    })

    expect(box?.width).toBe(196)
    // The gap is the visible half of "does not stretch": a grown field leaves only the row's own 8px.
    expect(box!.slack).toBeGreaterThan(24)
  })

  /**
   * The placeholder is the field's only label, so it has to READ, whole (2699:386161).
   *
   * The web's wording ("Search item, creator, collection, name…") needs 211px at this size and the field
   * is 196 — it trailed off at "…collection, n" until the web view got the design's own shorter string.
   * Nothing in jsdom can see that: a clipped placeholder has the same DOM as a shown one. So the guard is
   * a measurement of the rendered string against the box, using the input's OWN computed font, which
   * keeps it honest if either the size or the wording moves.
   */
  it('shows the whole placeholder in the iOS web view, at the narrowest phone', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending Products')

    const fits = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="subnav"] input[placeholder]') as HTMLInputElement | null
      if (!input) return null
      const cs = getComputedStyle(input)
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`
      return ctx.measureText(input.placeholder).width <= input.getBoundingClientRect().width
    })

    expect(fits).toBe(true)
  })

  // The web keeps the field on its own row: the CTA is still there holding the top one, and this is the
  // control that stops the rule above from leaking out of the web view.
  it('leaves the search field on its own row on the web', async () => {
    const page = await phone('/overview', 'Trending Products')

    const sameRow = await page.evaluate(() => {
      const cart = document.querySelector('[data-testid="subnav-cart"]')
      const field = document.querySelector('[data-testid="subnav"] input[placeholder]')
      if (!cart || !field) return null
      const a = cart.getBoundingClientRect()
      const b = field.getBoundingClientRect()
      return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 20
    })

    expect(sameRow).toBe(false)
  })

  /**
   * The purchase-complete CTAs stack, primary on top.
   *
   * Geometry rather than a class or an attribute, because the interesting part is not that the container
   * opts in — it is that the buttons come out one per row with the ruby one ABOVE, and `column-reverse`
   * gets that from markup whose DOM order says the opposite. An assertion on `data-stack` would pass just
   * as happily with the flex rule deleted.
   *
   * Also pins the height, which is the trap: the row sizes both CTAs with `flex: 1`, and in a column that
   * basis applies to the height and collapses them unless it is overridden.
   */
  it('stacks the purchase-complete CTAs with try-in-world on top', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app
    await page.setViewport(PHONE)

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')
    await clickWhenEnabled(page, 'button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)

    const box = await page.evaluate(() => {
      // Scoped to the footer, NOT matched by text across the document: the navbar carries its own "My
      // Items" link, and picking that one up compares the modal's CTA against something near the top of
      // the page — which fails whatever the footer does.
      const footer = document.querySelector('[data-stack]')
      if (!footer) return null
      const ctas = [...footer.children] as HTMLElement[]
      const tryInWorld = ctas.find(el => /try in world/i.test(el.innerText))
      const myItems = ctas.find(el => /my items/i.test(el.innerText))
      if (!tryInWorld || !myItems || tryInWorld === myItems) return null
      const a = tryInWorld.getBoundingClientRect()
      const b = myItems.getBoundingClientRect()
      return {
        primaryIsAbove: a.bottom <= b.top + 1,
        // One per row: no horizontal overlap is not enough — they must not share a row at all.
        sharesARow: a.right > b.left && b.right > a.left && Math.abs(a.top - b.top) < 5,
        primaryHeight: Math.round(a.height),
        secondaryHeight: Math.round(b.height)
      }
    })

    expect(box).not.toBeNull()
    expect(box!.primaryIsAbove).toBe(true)
    expect(box!.sharesARow).toBe(false)
    // The 46px the row gives them, not the ~20px a collapsed flex basis would leave.
    expect(box!.primaryHeight).toBeGreaterThanOrEqual(40)
    expect(box!.secondaryHeight).toBeGreaterThanOrEqual(40)
  })

  /**
   * The search suggestions must land ON the screen inside the iOS web view.
   *
   * The panel grows LEFTWARD from the field's right edge, which is right on the web — the field owns a
   * full-width row there. In the web view the field is 196px at the START of the top row, so a
   * viewport-wide panel grown leftward from its right edge hung 155px off the left of the screen with the
   * results clipped.
   *
   * Measured rather than asserted on a class: the bug was pure geometry, and the panel's own styles looked
   * perfectly reasonable in isolation. Both edges are checked, because the fix flips the anchor and the way
   * to get that wrong is to push it off the OTHER side.
   */
  it('keeps the search suggestions on screen inside the ios web view', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending')

    await page.click('input[placeholder]')
    await page.type('input[placeholder]', 'hat')
    await page.waitForSelector('[data-testid="search-pop"]', { timeout: 20000 })

    const box = await page.evaluate(() => {
      const pop = document.querySelector('[data-testid="search-pop"]') as HTMLElement | null
      if (!pop) return null
      const r = pop.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), viewport: window.innerWidth }
    })

    expect(box).not.toBeNull()
    expect(box!.left).toBeGreaterThanOrEqual(0)
    expect(box!.right).toBeLessThanOrEqual(box!.viewport)
  })

  /**
   * The profile panel inside the web view: reachable, and trimmed to sign-out.
   *
   * The avatar used to be blocked outright, alongside the logo — which left the buyer unable to open their
   * profile at all, and with no way to sign out of a device that may not be theirs. It opens again, but the
   * four rows that NAVIGATE (View Profile, My Assets, Account Settings, Marketplace Authorizations) are
   * links out to decentraland.org, the same one-way trip the logo is still blocked for.
   *
   * Clicked with a real tap rather than `element.click()`, because a JS click fires the handler even
   * through `pointer-events: none` — it would pass against the bug this fixes.
   */
  it('lets the buyer sign out from the profile panel in the ios web view', async () => {
    const page = await phone('/overview?view=mobile-iap', 'Trending')

    await page.click('button[aria-label="User menu"]')
    await page.waitForSelector('[data-mobile-user-card]', { timeout: 20000 })

    const panel = await page.evaluate(() => {
      const card = document.querySelector('[data-mobile-user-card]') as HTMLElement
      const visible = (el: Element) => getComputedStyle(el).display !== 'none'
      return {
        outboundLinks: [...card.querySelectorAll('a')].filter(visible).length,
        hasSignOut: [...card.querySelectorAll('button')].some(b => /log ?out|sign ?out/i.test(b.textContent ?? ''))
      }
    })

    expect(panel.hasSignOut).toBe(true)
    expect(panel.outboundLinks).toBe(0)
  })

  // The trim is the WEB VIEW's, not the Shop's: on the web the same panel keeps every row.
  it('keeps the whole profile menu on the web', async () => {
    const page = await phone('/overview', 'Trending')

    await page.click('button[aria-label="User menu"]')
    await page.waitForSelector('[data-mobile-user-card]', { timeout: 20000 })

    const links = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-mobile-user-card] a')].filter(a => getComputedStyle(a).display !== 'none')
          .length
    )

    expect(links).toBeGreaterThan(0)
  })
})
