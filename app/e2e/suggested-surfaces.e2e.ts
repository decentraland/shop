import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

/**
 * The personalised rail on the surfaces that are not the home page.
 *
 * Both of these already had something in that slot — the cart a generic upsell, the favourites page
 * nothing at all — so what these assert is the SWAP: the personal rail stands in, and the thing it stood
 * in for comes back when there is nothing personal to say.
 */
let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const persistedCart = JSON.stringify({
  state: {
    items: [
      {
        id: 'trade-2',
        tradeId: 'trade-2',
        tokenId: '7',
        itemId: '1',
        contractAddress: COLLECTION,
        name: 'Nebula Jacket',
        creator: CREATOR_ADDRESS,
        category: 'wearable',
        rarity: 'legendary',
        network: 'MATIC',
        chainId: 80002,
        thumbnail: '',
        priceCredits: 135,
        gender: null,
        isSmart: false,
        quantity: 1
      }
    ]
  },
  version: 2
})

async function openCart(options: Parameters<typeof launchApp>[0] = {}): Promise<App> {
  const launched = await launchApp({ ...options, path: '/' })
  await launched.page.evaluate(c => localStorage.setItem('dcl_shop_cart', c), persistedCart)
  await launched.page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 45000 })
  await waitForText(launched.page, 'Nebula Jacket')
  return launched
}

describe('suggested for you in the cart', () => {
  it('leaves out what is already in the basket', async () => {
    app = await openCart({ suggestedForYou: true })
    const { page } = app
    const asked: string[] = []
    page.on('request', r => {
      if (r.url().includes('/v3/catalog/suggested')) asked.push(r.url())
    })
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })

    const exclude = new URL(asked[asked.length - 1]).searchParams.get('exclude')
    expect(exclude).toBe(`${COLLECTION.toLowerCase()}-1`)
    // One question, not two: the page asks to decide, the rail asks to render, same key.
    expect(new Set(asked).size).toBe(1)
  })

  it('stands in for the generic upsell rather than stacking on it', async () => {
    app = await openCart({ suggestedForYou: true })
    const { page } = app
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })
    expect(await bodyText(page)).toContain('Goes with your cart')
    expect(await bodyText(page)).not.toContain('You might also like')
  })

  it('gives the generic upsell back when there is nothing personal to say', async () => {
    app = await openCart({ suggestedForYou: true, suggested: { personalized: false } })
    const { page } = app
    await waitForText(page, 'You might also like')
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('keeps the generic upsell while the feature is off', async () => {
    app = await openCart({ suggestedForYou: false })
    const { page } = app
    await waitForText(page, 'You might also like')
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })
})

describe('suggested for you on the favourites page', () => {
  it('offers something under the list rather than nothing', async () => {
    app = await launchApp({ suggestedForYou: true, path: '/my-favorites' })
    const { page } = app
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })
    expect(await bodyText(page)).toContain('More like what you saved')
  })

  it('shows nothing extra while the feature is off', async () => {
    app = await launchApp({ suggestedForYou: false, path: '/my-favorites' })
    const { page } = app
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })
})
