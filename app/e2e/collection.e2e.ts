import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('collection storefront', () => {
  it('shows the hero, creator identity block, and every item of the collection', async () => {
    // Collection page reads fetchCollectionItems → GET /v3/catalog/items?contractAddress=<collection>
    // (mocked from the shopListings fixture in helpers/app.ts).
    app = await launchApp({ path: `/collection/${COLLECTION}` })
    const { page } = app

    // Title comes from the collections entity (fetchCollection → /v1/collections?contractAddress=),
    // not the item records, which carry no collection name. It renders in the cover hero.
    await waitForText(page, 'Galaxy Collection')
    const heroTitle = await page.evaluate(() => document.querySelector('.collection-hero__title')?.textContent ?? '')
    expect(heroTitle).toContain('Galaxy Collection')

    // The creator identity block (sidebar) resolves the creator's DCL profile name + a View profile
    // link out to their public profile.
    await waitForText(page, 'Galaxy Studio')
    const viewHref = await page.evaluate(
      () => document.querySelector('.creator-card__view')?.getAttribute('href') ?? ''
    )
    // The View profile link points at the creator's public DCL profile (…/profile/<creator address>).
    expect(viewHref).toContain('/profile/0xcccccccccccccccccccccccccccccccccccccccc')

    // Items render as real cards (skeletons resolved) and the FilterBar count reflects them.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(2)
    await waitForText(page, '2 items')

    // The shared browse controls are present (same as the Creator storefront): sidebar filters + FilterBar.
    expect(await page.evaluate(() => !!document.querySelector('.browse--sidebar .browse__toolbar'))).toBe(true)
  })

  it('lists every item of the collection from /v3/catalog/items', async () => {
    // Collection page reads fetchCollectionItems → GET /v3/catalog/items?contractAddress=<collection>
    // (mocked from the shopListings fixture in helpers/app.ts).
    app = await launchApp({ path: `/collection/${COLLECTION}` })
    const { page } = app

    // Title comes from the collections entity (fetchCollection → /v1/collections?contractAddress=),
    // not the item records, which carry no collection name.
    await waitForText(page, 'Galaxy Collection')
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.querySelectorAll('.card:not(.card--skeleton)').length)).toBe(2)
    await waitForText(page, '2 items')

    // The shared browse controls are present (same as the Creator storefront): sidebar filters + FilterBar.
    expect(await page.evaluate(() => !!document.querySelector('.browse--sidebar .browse__toolbar'))).toBe(true)
  })

  it('renders on a mobile viewport', async () => {
    app = await launchApp({ path: `/collection/${COLLECTION}` })
    const { page } = app
    await page.setViewport({ width: 390, height: 800 })
    await waitForText(page, 'Galaxy Collection')
    await waitForText(page, 'Galaxy Hat')
    // The collection page's own content (hero, sidebar, grid) fits the viewport — it doesn't spill
    // off-screen at a narrow width. (The shared nav bar has its own pre-existing scroll behavior, so
    // we measure this page's container, not the document.)
    const widest = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const els = [
        '.collection-page',
        '.collection-hero',
        '.browse--sidebar',
        '.browse__sidebar',
        '.grid',
        '.creator-card',
      ]
      return Math.max(
        0,
        ...els.map(sel => {
          const el = document.querySelector(sel) as HTMLElement | null
          return el ? Math.round(el.getBoundingClientRect().right - vw) : 0
        })
      )
    })
    expect(widest).toBeLessThanOrEqual(1)
  })
})
