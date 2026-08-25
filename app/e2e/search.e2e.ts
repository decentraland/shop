import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The search input lives in the sub-nav on every page (aria-label "Search the shop").
const SEARCH = 'input[aria-label="Search the shop"]'

describe('search bar', () => {
  it('shows live item suggestions in a dropdown while typing', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')

    // The dropdown fetches the same feed the results grid uses (/v3/catalog/unified?groupBy=item)
    // and shows the matching item.
    await page.waitForSelector('[data-testid="search-pop"]')
    await waitForText(page, 'Nebula Jacket')
    // "Galaxy Hat" doesn't match the query → not suggested.
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-testid="search-pop"]')!.textContent!.includes('Galaxy Hat')
      )
    ).toBe(false)
  })

  it('opens the item detail page when a suggestion is clicked', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')
    await page.waitForSelector('[data-testid="search-pop-row"]')

    expect(await clickByText(page, '[data-testid="search-pop-row"]', /nebula jacket/i)).toBe(true)

    // Nebula Jacket is a secondary listing (tokenId 7) → routed to /token/<collection>/7.
    await page.waitForFunction(() => /\/token\//.test(location.pathname))
    await waitForText(page, 'Nebula Jacket')
  })

  it('surfaces creator and collection suggestions alongside items', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')

    await page.waitForSelector('[data-testid="search-pop"]')
    // Item (name match), collection (/v1/collections?search=), and creator (DCL-name → owner →
    // seller → profile) all surface in the one stacked list.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Galaxy Collection')
    await waitForText(page, 'Galaxy Studio')
  })

  it('opens the collection page when a collection suggestion is clicked', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="collection"]')

    // The collection row shows a mosaic of the collection's item thumbnails (à la marketplace),
    // not the fallback icon — one cell per item (2 here: epic + legendary).
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="search-pop-row"][data-kind="collection"] [data-testid="coll-thumb-cell"]'
        ).length === 2
    )

    expect(
      await clickByText(page, '[data-testid="search-pop-row"][data-kind="collection"]', /galaxy collection/i)
    ).toBe(true)
    await page.waitForFunction(() => /\/collection\//.test(location.pathname))
  })

  it('opens the creator page when a creator suggestion is clicked', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="creator"]')

    expect(await clickByText(page, '[data-testid="search-pop-row"][data-kind="creator"]', /galaxy studio/i)).toBe(true)
    await page.waitForFunction(() => /\/creator\//.test(location.pathname))
  })

  it('runs a full search on Enter and lands on /items?q=', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')
    await page.keyboard.press('Enter')

    await page.waitForFunction(() => location.pathname === '/items' && /q=Galaxy/i.test(location.search))
    // The results header echoes the query, and the matching item renders in the grid.
    await waitForText(page, 'Galaxy Hat')
  })

  // The bug this guards: the dropdown, the on-sale grid and the all/not-for-sale grid used to run
  // three different server-side searches, so one query could suggest an item the grid then hid, and
  // widening Status from "On Sale" to "All" could drop the results to zero.
  it('suggests the same item the results grid then shows', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="item"]')
    const suggested = await page.$eval('[data-testid="search-pop-row"][data-kind="item"]', el => el.textContent ?? '')
    expect(suggested).toMatch(/nebula jacket/i)

    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.pathname === '/items')
    await waitForText(page, 'Nebula Jacket')
  })

  it('keeps a search result when Status widens from On Sale to All', async () => {
    app = await launchApp({ path: '/items?q=Nebula' })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    // Status radios, in order: All, On Sale, Not for Sale.
    await page.waitForSelector('[data-testid="browse-sidebar"] input[type="radio"]')
    await page.$$eval('[data-testid="browse-sidebar"] input[type="radio"]', els => (els[0] as HTMLElement).click())

    // "All" must be a superset of "On Sale" — the item stays, and the choice lands in the URL so the
    // view can be shared or refreshed.
    await page.waitForFunction(() => /status=all/.test(location.search) && /q=Nebula/.test(location.search))
    await waitForText(page, 'Nebula Jacket')
  })

  it('restores a shared not-for-sale search from the URL', async () => {
    app = await launchApp({ path: '/items?q=Nebula&status=not_for_sale' })
    const { page } = app

    await page.waitForSelector('[data-testid="browse-empty"]')
    const checked = await page.$$eval('[data-testid="browse-sidebar"] input[type="radio"]', els =>
      els.map(el => (el as HTMLInputElement).checked)
    )
    expect(checked).toEqual([false, false, true])
  })

  it('keeps the suggestions dropdown wide and on-screen on a mobile viewport', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app
    await page.setViewport({ width: 375, height: 720 })

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')
    await page.waitForSelector('[data-testid="search-pop"]')

    // The search field flex-shrinks on mobile; the panel must break out of it (near full-width) and
    // must not spill past the right edge of the viewport (no horizontal clipping).
    const { width, right } = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="search-pop"]')!.getBoundingClientRect()
      return { width: r.width, right: r.right }
    })
    expect(width).toBeGreaterThan(300)
    expect(right).toBeLessThanOrEqual(375)
  })

  /**
   * The one control that reaches the full result set has to be reachable without scrolling INSIDE the
   * dropdown. It used to sit after the last suggestion in a panel that scrolls, so on a query with many
   * matches it was below the fold of a menu most people never scroll — the results page was effectively
   * unreachable from the suggestions.
   */
  it('keeps "See all results" in view without scrolling the suggestions', async () => {
    // Enough suggestions to OVERFLOW the panel — the default fixture has one match, and with a single row
    // the footer sits at the bottom whether or not it is pinned, so the assertions below would pass
    // either way. Local to this spec: `unifiedListings` also feeds the browse grid, where extra rows
    // change what other specs count.
    const many = Array.from({ length: 20 }, (_, i) => ({
      tradeId: `pinned-${i}`,
      listingType: 'primary',
      contractAddress: '0x0000000000000000000000000000000000000abc',
      itemId: String(i),
      tokenId: null,
      name: `Nebula Cap ${i}`,
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: '0x0000000000000000000000000000000000000001',
      priceCredits: 10 + i,
      available: 5,
      network: 'MATIC',
      chainId: 80002,
      source: 'native',
      manaWei: null,
      listingCount: 1
    }))
    app = await launchApp({ path: '/overview', fixtures: { unifiedListings: { data: many, total: many.length } } })
    const { page } = app
    // Short on purpose: the panel is capped at 70vh, which is what makes the capped suggestion list
    // overflow it.
    await page.setViewport({ width: 1280, height: 420 })

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')
    await page.waitForSelector('[data-testid="search-pop"]')
    await page.waitForSelector('[data-testid="search-see-all"]')

    const geometry = await page.evaluate(() => {
      const popEl = document.querySelector('[data-testid="search-pop"]')!
      const pop = popEl.getBoundingClientRect()
      const seeAll = document.querySelector('[data-testid="search-see-all"]')!.getBoundingClientRect()
      return {
        overflows: popEl.scrollHeight > popEl.clientHeight + 1,
        popBottom: pop.bottom,
        seeAllTop: seeAll.top,
        seeAllBottom: seeAll.bottom
      }
    })

    // The premise: if the list does not overflow, this test proves nothing.
    expect(geometry.overflows).toBe(true)
    // Held at the panel's bottom edge instead of sitting somewhere down the scroll.
    expect(geometry.seeAllBottom).toBeLessThanOrEqual(geometry.popBottom + 1)
    expect(geometry.seeAllTop).toBeLessThan(geometry.popBottom)
  })

  it('reflects the URL query in the input on a deep link', async () => {
    // Landing directly on a filtered URL must pre-fill the search box (previously it stayed blank).
    app = await launchApp({ path: '/items?q=Nebula' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    const value = await page.$eval(SEARCH, el => (el as HTMLInputElement).value)
    expect(value).toBe('Nebula')
  })

  it('clears the search with the clear button and returns to /items', async () => {
    app = await launchApp({ path: '/items?q=Nebula' })
    const { page } = app

    await page.waitForSelector('[data-testid="subnav-search-clear"]')
    await page.click('[data-testid="subnav-search-clear"]')

    await page.waitForFunction(() => location.pathname === '/items' && location.search === '')
    const value = await page.$eval(SEARCH, el => (el as HTMLInputElement).value)
    expect(value).toBe('')
  })

  // The sub-nav's other items (tab strip + credits/cart) used to squeeze the field down to the
  // bare magnifier well above the mobile breakpoint — 94px of input at 1280, 14px at 1200 — and then
  // pushed the page into horizontal overflow. The strip yields (and scrolls) above `lg`; at `lg` and
  // below the row wraps and the field gets its own line. A MANA balance is kept in play so the run
  // still covers the widest navbar (the chip now lives in the GLOBAL navbar as a ui2 chip with no
  // testid; its aria-label is the stable hook) — waiting on it also keeps the balance fetch settled
  // before the widths are measured.
  it('keeps the field usable, and the page unscrolled sideways, as the window narrows', async () => {
    app = await launchApp({ path: '/items', manaBalanceWei: '5000000000000000000' })
    const { page } = app
    await page.waitForSelector(SEARCH)
    await page.waitForSelector('button[aria-label$="MANA on Polygon"]')

    for (const width of [1512, 1280, 1024, 901, 900, 800, 780, 769]) {
      await page.setViewport({ width, height: 860 })
      const m = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Search the shop"]') as HTMLElement
        const subnav = document.querySelector('[data-testid="subnav"]') as HTMLElement
        const doc = document.documentElement
        // Scoped to the sub-nav on purpose: it is what used to force the page wider. A whole-page check
        // also catches the ui2 footer's Resources column, which spills a few px wherever Inter is
        // missing and the fallback font measures wider — not this row's doing.
        // Names what sticks out, so a failure points at an element instead of just saying "true".
        const offenders: string[] = []
        subnav.querySelectorAll<HTMLElement>('*').forEach(el => {
          const r = el.getBoundingClientRect()
          if (r.width === 0) return
          if (r.right > doc.clientWidth + 1 || r.left < -1) {
            const id = el.dataset.testid ? `[${el.dataset.testid}]` : ''
            offenders.push(
              `${el.tagName.toLowerCase()}${id} L=${Math.round(r.left)} R=${Math.round(r.right)} ` +
                `cssW=${getComputedStyle(el).width} "${(el.textContent ?? '').trim().slice(0, 18)}"`
            )
          }
        })
        return {
          input: input.getBoundingClientRect().width,
          box: `content ${doc.clientWidth} / sub-nav ${Math.round(subnav.getBoundingClientRect().width)}`,
          // The row itself must not scroll sideways either: the strip does that, inside its own box.
          rowScrolls: subnav.scrollWidth > subnav.clientWidth + 1,
          offenders: offenders.slice(-6)
        }
      })
      // Wide enough to read a query back, not just an icon.
      expect(m.input, `input width at ${width}px`).toBeGreaterThan(120)
      expect(m.offenders, `sub-nav overflow at ${width}px — ${m.box}`).toEqual([])
      expect(m.rowScrolls, `sub-nav scrolls sideways at ${width}px`).toBe(false)
    }
  })

  it('gives the tab strip its own row below lg, and keeps it whole on a desktop window', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await page.waitForSelector('[data-testid="subnav-tabs"]')
    const tabsClipped = async () =>
      page.evaluate(() => {
        const nav = document.querySelector('[data-testid="subnav-tabs"]')!
        return nav.scrollWidth > nav.clientWidth + 1
      })

    // The search field takes the slack it can get here, so no tab label is cut.
    await page.setViewport({ width: 1440, height: 860 })
    expect(await tabsClipped(), 'tabs clipped at 1440').toBe(false)
    // Between the pill's floor and the wrap the strip is what yields, so it scrolls.
    await page.setViewport({ width: 1024, height: 860 })
    expect(await tabsClipped(), 'tabs clipped at 1024').toBe(true)
    // At `lg` the row wraps and the strip gets a full line back — every tab is reachable again.
    await page.setViewport({ width: 900, height: 860 })
    expect(await tabsClipped(), 'tabs clipped at 900').toBe(false)
    await page.setViewport({ width: 800, height: 860 })
    expect(await tabsClipped(), 'tabs clipped at 800').toBe(false)
  })

  it('centres the clear button glyph inside its round hover fill', async () => {
    app = await launchApp({ path: '/items?q=Nebula' })
    const { page } = app
    await page.waitForSelector('[data-testid="subnav-search-clear"]')

    // The UA button padding left an 8px content box, so the 14px glyph start-aligned 3px off-centre.
    const delta = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="subnav-search-clear"]') as HTMLElement
      const ico = btn.querySelector('[data-testid="subnav-search-clear-icon"]') as HTMLElement
      const b = btn.getBoundingClientRect()
      const i = ico.getBoundingClientRect()
      return { x: i.x + i.width / 2 - (b.x + b.width / 2), y: i.y + i.height / 2 - (b.y + b.height / 2) }
    })
    expect(Math.abs(delta.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(delta.y)).toBeLessThanOrEqual(0.5)
  })
})
