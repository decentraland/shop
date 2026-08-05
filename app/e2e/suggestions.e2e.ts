import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS, shopListings } from './fixtures'

/**
 * THE PDP RAIL BELOW THE FOLD.
 *
 * A real collection usually holds two or three items, so a rail drawn from the collection alone showed a
 * near-empty row. It now fills from three tiers (collection → the creator's other items → similar items)
 * and only stays titled after the collection while EVERY card on it belongs to that collection.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const OTHER_COLLECTION = '0xc0113c1100000000000000000000000000000002'

const row = (contractAddress: string, itemId: number, name: string) => ({
  tradeId: `trade-${contractAddress.slice(-1)}-${itemId}`,
  listingType: 'primary',
  contractAddress,
  itemId: String(itemId),
  tokenId: null,
  name,
  thumbnail: '',
  rarity: 'common',
  category: 'wearable',
  wearableCategory: 'hat',
  creator: CREATOR_ADDRESS,
  priceCredits: 10 + itemId,
  available: 5,
  network: 'MATIC',
  chainId: 80002
})

// The catalog feed the rail reads (/v3/catalog/items), which the mock serves from `shopListings`. The
// unified feed the PDP hydrates the viewed item from is a separate fixture, so these rows only ever
// reach the carousel.
const withCreatorCatalog = (count: number) => ({
  data: [
    ...shopListings.data,
    ...Array.from({ length: count }, (_, i) => row(OTHER_COLLECTION, i, `Creator Item ${i}`))
  ],
  total: shopListings.data.length + count
})

const railCards = (page: App['page']) => page.$$eval('[data-testid="carousel"] [data-testid="card"]', els => els.length)

const railText = (page: App['page']) => page.$eval('[data-testid="carousel"]', el => (el as HTMLElement).innerText)

describe('the suggestions rail on an item page', () => {
  it('pads a two-item collection with the creator’s other items up to a full rail', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, fixtures: { shopListings: withCreatorCatalog(20) } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'You might also like')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="carousel"] [data-testid="card"]').length >= 15,
      { timeout: 20000 }
    )

    // The collection's own item leads, the creator's follow.
    const rail = await railText(page)
    expect(rail).toContain('Nebula Jacket')
    expect(rail).toContain('Creator Item 0')
    // A padded rail can no longer claim to be the collection, nor offer a "View all" into it.
    expect(rail).not.toMatch(/more from this collection/i)
    expect(rail).not.toMatch(/view all/i)
  })

  it('keeps the collection heading and its "View all" when the collection fills the rail alone', async () => {
    const siblings = Array.from({ length: 16 }, (_, i) => row(COLLECTION, i + 10, `Galaxy Sibling ${i}`))
    app = await launchApp({
      path: `/item/${COLLECTION}/0`,
      fixtures: { shopListings: { data: [...shopListings.data, ...siblings], total: shopListings.data.length + 16 } }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'More from this collection')

    const rail = await railText(page)
    expect(rail).toMatch(/view all/i)
    expect(rail).not.toMatch(/you might also like/i)
  })

  it('renders the padded rail on a phone without pushing the page sideways', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, fixtures: { shopListings: withCreatorCatalog(20) } })
    const { page } = app
    await page.setViewport({ width: 375, height: 812 })

    await waitForText(page, 'You might also like')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="carousel"] [data-testid="card"]').length >= 15,
      { timeout: 20000 }
    )

    expect(await railCards(page)).toBeGreaterThanOrEqual(15)
    // The rail scrolls inside its own track; the page itself must not.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true)
    expect(await bodyText(page)).toContain('Creator Item 0')
  })
})
