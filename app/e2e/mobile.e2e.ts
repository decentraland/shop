import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

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
async function phone(path: string, anchor: string, fixtures?: NonNullable<Parameters<typeof launchApp>[0]>['fixtures']) {
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
    const page = await phone('/assets', 'Nebula Jacket')
    // The filter sidebar collapses into a drawer at this width; the cards must survive that.
    expect(await page.$$eval('[data-testid="card"]', els => els.length)).toBeGreaterThan(0)
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
  })

  it('the item detail page keeps its price and buy action', async () => {
    const page = await phone(`/item/${COLLECTION}/1`, 'Nebula Jacket', { trade: buyTrade })
    const text = await bodyText(page)
    expect(text).toMatch(/buy now/i)
    expect(text).toMatch(/add to cart/i)
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
