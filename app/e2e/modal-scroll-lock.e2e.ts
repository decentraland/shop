import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText, clickWhenEnabled } from './helpers/dom'
import { COLLECTION, TEST_ADDRESS } from './fixtures'
let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})
const bi = (n: number, name: string) => ({
  id: 'i' + n,
  collection_id: 'col-1',
  contract_address: COLLECTION,
  blockchain_item_id: String(n),
  name,
  thumbnail: 'thumbnail.png',
  contents: { 'thumbnail.png': 'bafyfake' },
  is_published: true,
  is_approved: true,
  total_supply: 0,
  rarity: 'epic',
  type: 'wearable',
  data: { wearable: { category: 'hat' } }
})
const li = (itemId: string, name: string, price: number) => ({
  tradeId: 't' + itemId,
  listingType: 'primary',
  contractAddress: COLLECTION,
  itemId,
  tokenId: null,
  name,
  thumbnail: '',
  rarity: 'epic',
  category: 'wearable',
  wearableCategory: 'hat',
  creator: TEST_ADDRESS,
  priceCredits: price,
  available: 10,
  network: 'MATIC',
  chainId: 80002
})
describe('scroll lock', () => {
  it('freezes the page behind a modal, without shifting it sideways', async () => {
    app = await launchApp({
      path: '/my-items?section=creations',
      creatorSales: true,
      fixtures: {
        importable: { data: [] },
        unifiedListings: { data: [] },
        shopListings: { data: [li('0', 'Galaxy Hat', 30)] },
        builderItems: {
          data: [bi(0, 'Galaxy Hat'), ...Array.from({ length: 23 }, (_, i) => bi(i + 1, `Galaxy ${i + 1}`))]
        },
        collectionSaleState: { data: [li('0', 'Galaxy Hat', 30)], total: 1 }
      }
    })
    const { page } = app
    await page.setViewport({ width: 1180, height: 700 })
    await waitForText(page, 'Galaxy Hat')

    const navWidth = () => page.$eval('[data-testid="subnav"]', el => Math.round(el.getBoundingClientRect().width))
    const before = await navWidth()

    await clickWhenEnabled(page, '[data-testid="creation-group-sale"]', /start a discount/i)
    await page.waitForSelector('[data-testid="creator-sale-modal"]')
    await new Promise(r => setTimeout(r, 300))

    // A REAL wheel, not `window.scrollBy`: `overflow: hidden` stops the user from scrolling but leaves
    // programmatic scrolling working, so scripting the scroll would pass against a page with no lock at all.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden')
    const start = await page.evaluate(() => window.scrollY)
    await page.mouse.move(60, 400)
    await page.mouse.wheel({ deltaY: 600 })
    await new Promise(r => setTimeout(r, 200))
    expect(await page.evaluate(() => window.scrollY)).toBe(start)

    // …and the full-width band must not have narrowed: the scrollbar's width is handed back as padding,
    // so hiding it cannot widen the viewport and shift the layout.
    expect(await navWidth()).toBe(before)

    // Closing it hands the page back.
    await page.click('[data-testid="creator-sale-modal"] button[aria-label]')
    await new Promise(r => setTimeout(r, 300))
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden')
  })
})
