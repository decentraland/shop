import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText } from './helpers/dom'
import { COLLECTION, TEST_ADDRESS } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const item = (bid: string, name: string, rarity: string) => ({
  id: `item-${bid}`,
  collection_id: 'col-1',
  contract_address: COLLECTION,
  blockchain_item_id: bid,
  name,
  thumbnail: 'thumbnail.png',
  contents: { 'thumbnail.png': 'bafyfake' },
  is_published: true,
  is_approved: true,
  total_supply: 0,
  rarity,
  type: 'wearable',
  data: { wearable: { category: 'hat' } }
})

// One collection, one item of each pricing: a Shop listing in credits, a classic listing still in MANA,
// and one not for sale at all.
const fixtures = {
  shopListings: { data: [] },
  unifiedListings: { data: [] },
  builderItems: {
    data: [item('0', 'Galaxy Hat', 'epic'), item('1', 'Galaxy Boots', 'rare'), item('2', 'Galaxy Cape', 'mythic')]
  },
  collectionSaleState: {
    data: [
      {
        tradeId: 'trade-galaxy',
        listingType: 'primary',
        contractAddress: COLLECTION,
        itemId: '0',
        tokenId: null,
        name: 'Galaxy Hat',
        thumbnail: '',
        rarity: 'epic',
        category: 'wearable',
        wearableCategory: 'hat',
        creator: TEST_ADDRESS,
        priceCredits: 30,
        available: 10,
        network: 'MATIC',
        chainId: 80002
      }
    ],
    total: 1
  },
  importable: {
    data: [
      {
        oldTradeId: 'old-trade-1',
        listingType: 'primary',
        contractAddress: COLLECTION,
        itemId: '1',
        tokenId: null,
        name: 'Galaxy Boots',
        thumbnail: '',
        rarity: 'rare',
        category: 'wearable',
        wearableCategory: 'hat',
        manaWei: '100000000000000000000',
        available: 100,
        network: 'MATIC',
        chainId: 80002
      }
    ]
  }
}

/**
 * Having classic listings is what this page's re-pricing prompt waits for, so every case here opens with
 * that modal over the view. Dismiss it first — its overlay swallows the next click otherwise.
 */
async function openCreations(fx: typeof fixtures) {
  const launched = await launchApp({ path: '/my-items?section=creations', fixtures: fx })
  await launched.page.waitForSelector('[data-testid="new-pricing-modal"]')
  await launched.page.click('[data-testid="new-pricing-later"]')
  await launched.page.waitForFunction(() => !document.querySelector('[data-testid="new-pricing-modal"]'))
  return launched
}

const cardNames = (page: App['page']) =>
  page.$$eval('[data-testid="grid"] [data-testid="card-name"]', els => els.map(e => e.textContent?.trim()))

/**
 * WCAG contrast for an element against what is actually painted behind it.
 *
 * The page field is a radial gradient on <body>, so no ancestor carries a background COLOUR to compare
 * with. Where the walk ends on a gradient, every colour stop is read out of it and the LIGHTEST one is
 * used — the worst case for light ink, and the part of the field the collection headers sit on.
 */
const contrastOf = (page: App['page'], selector: string) =>
  page.evaluate(sel => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const el = document.querySelector(sel) as HTMLElement
    const fg = lum(parse(getComputedStyle(el).color))
    let node: HTMLElement | null = el
    let bg: number | null = null
    while (node && bg == null) {
      const cs = getComputedStyle(node)
      if (cs.backgroundColor && !cs.backgroundColor.includes('rgba(0, 0, 0, 0)')) bg = lum(parse(cs.backgroundColor))
      else {
        const stops = cs.backgroundImage.match(/rgba?\([^)]+\)/g)
        if (stops) bg = Math.max(...stops.map(c => lum(parse(c))))
      }
      node = node.parentElement
    }
    if (bg == null) throw new Error('nothing paints behind ' + sel)
    const [hi, lo] = [fg, bg].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }, selector)

describe('my creations', () => {
  it('counts what is on sale per collection, in legible ink', async () => {
    app = await openCreations(fixtures)
    const { page } = app

    await page.waitForSelector('[data-testid="creation-group-count"]')
    const meta = await page.$eval('[data-testid="creation-group-count"]', el => el.textContent?.trim())
    expect(meta).toBe('3 items · 1 on sale')

    // 13px is small text, so it needs 4.5:1. Gray 3 gave 2.2 against the field's lightest point.
    expect(await contrastOf(page, '[data-testid="creation-group-count"]')).toBeGreaterThanOrEqual(4.5)
  })

  it('dismisses the classic-pricing banner for this visit only, without storing anything', async () => {
    app = await openCreations(fixtures)
    const { page } = app

    await page.waitForSelector('[data-testid="mana-pricing-banner"]')
    await page.click('[data-testid="mana-pricing-banner-dismiss"]')
    await page.waitForFunction(() => !document.querySelector('[data-testid="mana-pricing-banner"]'))

    // Nothing was written, so the nudge is back on the next load — the listings it is about still exist.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(stored).not.toContain('mana-pricing-banner')
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('[data-testid="mana-pricing-banner"]')
    expect(await page.$('[data-testid="mana-pricing-banner-dismiss"]')).not.toBeNull()
  })

  it('filters creations by how they are priced', async () => {
    app = await openCreations(fixtures)
    const { page } = app

    await page.waitForSelector('[data-testid="price-filter-all"]')
    expect(await cardNames(page)).toEqual(['Galaxy Hat', 'Galaxy Boots', 'Galaxy Cape'])

    await page.click('[data-testid="price-filter-credits"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-name"]').length === 1)
    expect(await cardNames(page)).toEqual(['Galaxy Hat'])

    await page.click('[data-testid="price-filter-mana"]')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="card-name"]')[0]?.textContent?.includes('Boots') ?? false
    )
    expect(await cardNames(page)).toEqual(['Galaxy Boots'])

    // The applied filter is removable from the toolbar like every other one.
    expect(await clickByText(page, '[data-testid="filter-chips"] button', /mana/i)).toBe(true)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-name"]').length === 3)
  })

  it('offers the price filter only on my creations', async () => {
    app = await launchApp({ path: '/my-items?section=wearables', fixtures })
    const { page } = app

    await page.waitForSelector('[data-testid="my-assets-sidebar"]')
    expect(await page.$('[data-testid="price-filter-all"]')).toBeNull()
  })
})
