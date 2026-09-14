import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('favorite an item', () => {
  it('signed in: a favorited item persists server-side and shows up in My Favorites', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Heart the first card.
    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.click('[data-testid="card-fav"]')

    // The pick is written to the favorites service → the favorites page re-reads it from there
    // (picks list → catalog hydration) after navigating.
    await page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText.includes('Galaxy Hat'))).toBe(true)
  })

  it('signed out: a favorited item persists locally and shows up in My Favorites', async () => {
    app = await launchApp({ path: '/items', signedOut: true })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.click('[data-testid="card-fav"]')

    // No session → localStorage bucket; still there after navigating.
    await page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForText(page, 'Galaxy Hat')
    expect(await page.evaluate(() => document.body.innerText.includes('Galaxy Hat'))).toBe(true)
  })

  it("the item page shows how many people saved it, and the viewer's own save raises it", async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Two saves by other accounts (the mock picks service), none by the viewer yet.
    await page.waitForSelector('[data-testid="fav-count"]', { timeout: 15000 })
    const count = () => page.$eval('[data-testid="fav-count"]', el => el.textContent?.trim())
    expect(await count()).toBe('2')

    await page.click('[data-fav-title]')
    await page.waitForFunction(() => document.querySelector('[data-testid="fav-count"]')?.textContent?.trim() === '3', {
      timeout: 15000
    })
    expect(await count()).toBe('3')
  })

  it('the grid keeps the heart for the hovered card, and its count follows the save', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')
    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })

    // At rest the card is its artwork: the heart is in the page (reachable, readable) but not painted.
    expect(await page.$eval('[data-testid="card-fav"]', el => getComputedStyle(el).opacity)).toBe('0')

    await page.hover('[data-testid="card"]')
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('[data-testid="card-fav"]') as Element).opacity === '1',
      { timeout: 15000 }
    )

    const count = () => page.$eval('[data-testid="card-fav-count"]', el => el.textContent?.trim())
    expect(await count()).toBe('2')

    await page.click('[data-testid="card-fav"]')
    await page.waitForFunction(
      () => document.querySelector('[data-testid="card-fav-count"]')?.textContent?.trim() === '3',
      { timeout: 15000 }
    )
    expect(await count()).toBe('3')
  })

  it('keeps the heart clear of the hover preview, which paints above everything the card draws', async () => {
    app = await launchApp({ path: '/items' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')
    await page.waitForSelector('[data-testid="card-fav"]', { timeout: 15000 })
    await page.hover('[data-testid="card"]')
    // The shared preview boots on idle and anchors to the hovered card's media.
    await page.waitForFunction(() => !!document.getElementById('hover-preview')?.parentElement?.style.clipPath, {
      timeout: 20000
    })

    const geometry = await page.evaluate(() => {
      const wrap = document.getElementById('hover-preview')?.parentElement as HTMLElement
      const layer = wrap.getBoundingClientRect()
      const fav = (document.querySelector('[data-testid="card-fav"]') as HTMLElement).getBoundingClientRect()
      const cut = /polygon\(0px 0px, ([\d.]+)px 0px, [\d.]+px ([\d.]+)px/.exec(wrap.style.clipPath)
      return {
        cutLeft: layer.left + Number(cut?.[1]),
        cutBottom: layer.top + Number(cut?.[2]),
        layerRight: layer.right,
        fav: { left: fav.left, right: fav.right, bottom: fav.bottom }
      }
    })

    // The cut runs from its left edge to the layer's right edge, and from the layer's top down to its
    // bottom edge — so the whole button sits inside it and nothing of the preview is painted over it.
    expect(geometry.cutLeft).toBeLessThanOrEqual(geometry.fav.left)
    expect(geometry.cutBottom).toBeGreaterThanOrEqual(geometry.fav.bottom)
    expect(geometry.fav.right).toBeLessThanOrEqual(geometry.layerRight + 1)
  })
})
