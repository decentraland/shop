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

    // The dropdown fetches /v3/catalog/shop?search=Nebula and shows the matching item.
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

  it('runs a full search on Enter and lands on /assets?q=', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')
    await page.keyboard.press('Enter')

    await page.waitForFunction(() => location.pathname === '/assets' && /q=Galaxy/i.test(location.search))
    // The results header echoes the query, and the matching item renders in the grid.
    await waitForText(page, 'Galaxy Hat')
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

  it('reflects the URL query in the input on a deep link', async () => {
    // Landing directly on a filtered URL must pre-fill the search box (previously it stayed blank).
    app = await launchApp({ path: '/assets?q=Nebula' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    const value = await page.$eval(SEARCH, el => (el as HTMLInputElement).value)
    expect(value).toBe('Nebula')
  })

  it('clears the search with the clear button and returns to /assets', async () => {
    app = await launchApp({ path: '/assets?q=Nebula' })
    const { page } = app

    await page.waitForSelector('[data-testid="subnav-search-clear"]')
    await page.click('[data-testid="subnav-search-clear"]')

    await page.waitForFunction(() => location.pathname === '/assets' && location.search === '')
    const value = await page.$eval(SEARCH, el => (el as HTMLInputElement).value)
    expect(value).toBe('')
  })

  // The sub-nav's other items (tab strip + balance/credits/cart) used to squeeze the field down to the
  // bare magnifier well above the mobile breakpoint — 94px of input at 1280, 14px at 1200 — and then
  // pushed the page into horizontal overflow. The strip yields (and scrolls) above `lg`; at `lg` and
  // below the row wraps and the field gets its own line. A MANA balance is in play because that chip
  // only renders for a wallet holding MANA and it is ~85px of the row's rigid width.
  it('keeps the field usable, and the page unscrolled sideways, as the window narrows', async () => {
    app = await launchApp({ path: '/assets', manaBalanceWei: '5000000000000000000' })
    const { page } = app
    await page.waitForSelector(SEARCH)
    await page.waitForSelector('[data-testid="subnav-mana-balance"]')

    for (const width of [1512, 1280, 1024, 901, 900, 800, 780, 769]) {
      await page.setViewport({ width, height: 860 })
      const m = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Search the shop"]') as HTMLElement
        const doc = document.documentElement
        return {
          input: input.getBoundingClientRect().width,
          overflow: doc.scrollWidth > doc.clientWidth + 1
        }
      })
      // Wide enough to read a query back, not just an icon.
      expect(m.input, `input width at ${width}px`).toBeGreaterThan(120)
      expect(m.overflow, `horizontal page overflow at ${width}px`).toBe(false)
    }
  })

  it('gives the tab strip its own row below lg, and keeps it whole on a desktop window', async () => {
    app = await launchApp({ path: '/assets' })
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
    app = await launchApp({ path: '/assets?q=Nebula' })
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
