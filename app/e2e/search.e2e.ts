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
    await page.waitForSelector('.search-pop')
    await waitForText(page, 'Nebula Jacket')
    // "Galaxy Hat" doesn't match the query → not suggested.
    expect(await page.evaluate(() => document.querySelector('.search-pop')!.textContent!.includes('Galaxy Hat'))).toBe(false)
  })

  it('opens the item detail page when a suggestion is clicked', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Nebula')
    await page.waitForSelector('.search-pop__row')

    expect(await clickByText(page, '.search-pop__row', /nebula jacket/i)).toBe(true)

    // Nebula Jacket is a secondary listing (tokenId 7) → routed to /item/<collection>/7.
    await page.waitForFunction(() => /\/item\//.test(location.pathname))
    await waitForText(page, 'Nebula Jacket')
  })

  it('surfaces creator and collection suggestions alongside items', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')

    await page.waitForSelector('.search-pop')
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
    await page.waitForSelector('.search-pop__row--collection')

    // The collection row shows a mosaic of the collection's item thumbnails (à la marketplace),
    // not the fallback icon — one cell per item (2 here: epic + legendary).
    await page.waitForFunction(
      () => document.querySelectorAll('.search-pop__row--collection .coll-thumb__cell').length === 2
    )

    expect(await clickByText(page, '.search-pop__row--collection', /galaxy collection/i)).toBe(true)
    await page.waitForFunction(() => /\/collection\//.test(location.pathname))
  })

  it('opens the creator page when a creator suggestion is clicked', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'Galaxy')
    await page.waitForSelector('.search-pop__row--creator')

    expect(await clickByText(page, '.search-pop__row--creator', /galaxy studio/i)).toBe(true)
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
    await page.waitForSelector('.search-pop')

    // The search field flex-shrinks on mobile; the panel must break out of it (near full-width) and
    // must not spill past the right edge of the viewport (no horizontal clipping).
    const { width, right } = await page.evaluate(() => {
      const r = document.querySelector('.search-pop')!.getBoundingClientRect()
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

    await page.waitForSelector('.subnav__search-clear')
    await page.click('.subnav__search-clear')

    await page.waitForFunction(() => location.pathname === '/assets' && location.search === '')
    const value = await page.$eval(SEARCH, el => (el as HTMLInputElement).value)
    expect(value).toBe('')
  })
})
