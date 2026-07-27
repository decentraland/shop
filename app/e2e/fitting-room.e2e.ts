import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

/**
 * The fitting room: trying the cart's outfit on before buying it.
 *
 * The unit spec covers the URN math with a stubbed preview. What it can't cover is the part that broke
 * in review — the room lives behind a button on the cart, mounts the real WearablePreview iframe, and has
 * to survive being opened, toggled and closed while the cart is still resolving prices underneath. So the
 * flow is driven here, from adding an item to closing the room.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const ITEM_PATH = `/item/${COLLECTION}/1`

/** Add the fixture item to the cart and land on the cart page, the way a buyer does. */
async function cartWithOneItem(page: App['page']) {
  await waitForText(page, 'Nebula Jacket')
  expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
  await waitForText(page, 'successfully added to cart')
  expect(await clickByText(page, 'a', /go to cart/i)).toBe(true)
  await waitForText(page, 'Purchase Summary')
  await waitForText(page, 'Nebula Jacket')
}

describe('the fitting room', () => {
  it('opens from the cart and lists what is in the basket', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app
    await cartWithOneItem(page)

    expect(await clickByText(page, 'button', /fitting room/i)).toBe(true)
    await page.waitForSelector('[data-testid="fitting-row"]', { timeout: 20000 })
    // One row per cart line, naming the item — an empty room would mean the cart never reached it.
    const rows = await page.$$eval('[data-testid="fitting-row"]', els => els.map(e => (e as HTMLElement).innerText))
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatch(/nebula jacket/i)
  })

  it('mounts the avatar preview', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app
    await cartWithOneItem(page)

    expect(await clickByText(page, 'button', /fitting room/i)).toBe(true)
    await page.waitForSelector('[data-testid="fitting-row"]', { timeout: 20000 })
    // The preview is an iframe pointed at the wearable-preview app; the room is useless without it.
    const frames = await page.$$eval('iframe', els => els.map(e => e.getAttribute('src') ?? ''))
    expect(frames.some(src => /wearable-preview/.test(src))).toBe(true)
  })

  it('lets a piece be toggled off and back on without losing the row', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app
    await cartWithOneItem(page)

    expect(await clickByText(page, 'button', /fitting room/i)).toBe(true)
    await page.waitForSelector('[data-testid="fitting-row"]', { timeout: 20000 })

    // The checkbox is visually hidden behind a custom-styled toggle, so it is clicked through the DOM
    // rather than by coordinates (puppeteer refuses to click a zero-size / transparent node).
    const checkbox = '[data-testid="fitting-row"] input[type="checkbox"]'
    const toggle = () => page.$eval(checkbox, el => (el).click())
    await page.waitForSelector(checkbox, { timeout: 20000 })
    expect(await page.$eval(checkbox, el => (el).checked)).toBe(true)

    await toggle()
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by tsc: this callback is typed against the page context
      sel => !(document.querySelector(sel) as HTMLInputElement | null)?.checked,
      { timeout: 10000 },
      checkbox
    )
    // Unchecking takes the piece off the avatar; it must NOT remove it from the basket.
    expect(await page.$$eval('[data-testid="fitting-row"]', els => els.length)).toBe(1)

    await toggle()
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required by tsc: this callback is typed against the page context
      sel => !!(document.querySelector(sel) as HTMLInputElement | null)?.checked,
      { timeout: 10000 },
      checkbox
    )
  })

  it('closes back to the cart with the basket intact', async () => {
    app = await launchApp({ path: ITEM_PATH, fixtures: { trade: buyTrade } })
    const { page } = app
    await cartWithOneItem(page)

    expect(await clickByText(page, 'button', /fitting room/i)).toBe(true)
    await page.waitForSelector('[data-testid="fitting-row"]', { timeout: 20000 })

    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('[data-testid="fitting-row"]'), { timeout: 10000 })
    // Back on the cart, still holding the item.
    expect(await bodyText(page)).toMatch(/purchase summary/i)
    expect(await bodyText(page)).toMatch(/nebula jacket/i)
  })
})
