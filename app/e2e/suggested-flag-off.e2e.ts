import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

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

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/** Every request the page made to the suggestions endpoint, on a page loaded with the flag OFF. */
async function withFlagOff(path: string, seedCart = false) {
  const launched = await launchApp({ suggestedForYou: false, path: seedCart ? '/' : path })
  const asked: string[] = []
  launched.page.on('request', r => {
    if (r.url().includes('/v3/catalog/suggested')) asked.push(r.url())
  })
  if (seedCart) {
    await launched.page.evaluate(c => localStorage.setItem('dcl_shop_cart', c), persistedCart)
    await launched.page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 45000 })
  } else {
    await launched.page.reload({ waitUntil: 'networkidle2' })
  }
  await new Promise(r => setTimeout(r, 2000))
  return { app: launched, asked }
}

/**
 * The rail is behind `shop-suggested-for-you`, and it now touches FOUR pages — two of which had something
 * in that slot already. So "off" has to mean more than "the row is absent": no request is made, no space
 * is reserved, and what those pages showed before is exactly what they show again.
 *
 * The second block covers the state the Shop is actually IN on the day it deploys, which is not the same
 * as the flag being present and false: the key does not exist yet, or the service answering it is
 * unreachable. Both must read as off.
 */
describe('with the rail switched off', () => {
  it('home: no request, no rail', async () => {
    const r = await withFlagOff('/overview')
    app = r.app
    expect(r.asked).toEqual([])
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
    expect(await app.page.$('[data-testid="suggested-row-skeleton"]')).toBeNull()
  })

  it('pdp: no request, no rail, and the collection carousel still there', async () => {
    const r = await withFlagOff(`/item/${COLLECTION}/1`)
    app = r.app
    await waitForText(app.page, 'Nebula Jacket')
    expect(r.asked).toEqual([])
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
    expect(await app.page.$('[data-testid="carousel"]')).not.toBeNull()
  })

  it('cart: no request, no rail, no empty wrapper, generic upsell still there', async () => {
    const r = await withFlagOff('/cart', true)
    app = r.app
    await waitForText(app.page, 'Nebula Jacket')
    expect(r.asked).toEqual([])
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
    expect(await app.page.$('[data-testid="cart-personal-upsell"]')).toBeNull()
    expect(await bodyText(app.page)).toContain('You might also like')
  })

  it('favorites: no request, no rail', async () => {
    const r = await withFlagOff('/my-favorites')
    app = r.app
    expect(r.asked).toEqual([])
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('navigating across all four in one session never asks', async () => {
    const launched = await launchApp({ suggestedForYou: false, path: '/overview' })
    app = launched
    const asked: string[] = []
    launched.page.on('request', r => {
      if (r.url().includes('/v3/catalog/suggested')) asked.push(r.url())
    })
    await clickByText(launched.page, 'a', /collectibles|items/i).catch(() => undefined)
    await launched.page.goto(`${BASE}/item/${COLLECTION}/1`, { waitUntil: 'networkidle2', timeout: 45000 })
    await launched.page.goto(`${BASE}/my-favorites`, { waitUntil: 'networkidle2', timeout: 45000 })
    await launched.page.goto(`${BASE}/overview`, { waitUntil: 'networkidle2', timeout: 45000 })
    await new Promise(r => setTimeout(r, 1500))
    expect(asked).toEqual([])
  })
})

describe('with the flag not created yet, or its service unreachable', () => {
  it('home stays inert when the flags service does not know the key', async () => {
    app = await launchApp({ suggestedForYou: false, path: '/overview', errors: { '/dapps.json': { status: 404 } } })
    const asked: string[] = []
    app.page.on('request', r => {
      if (r.url().includes('/v3/catalog/suggested')) asked.push(r.url())
    })
    await app.page.reload({ waitUntil: 'networkidle2' })
    await new Promise(r => setTimeout(r, 2000))
    expect(asked).toEqual([])
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('the pdp keeps its own carousel when the flags service is down', async () => {
    app = await launchApp({
      suggestedForYou: false,
      path: `/item/${COLLECTION}/1`,
      errors: { '/dapps.json': { status: 500 } }
    })
    await waitForText(app.page, 'Nebula Jacket')
    await new Promise(r => setTimeout(r, 1500))
    expect(await app.page.$('[data-testid="suggested-row"]')).toBeNull()
    expect(await app.page.$('[data-testid="carousel"]')).not.toBeNull()
  })

  it('the cart keeps its generic upsell when the flags service is down', async () => {
    app = await launchApp({ suggestedForYou: false, path: '/overview', errors: { '/dapps.json': { status: 500 } } })
    await app.page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 45000 })
    await new Promise(r => setTimeout(r, 1500))
    expect(await app.page.$('[data-testid="cart-personal-upsell"]')).toBeNull()
    expect(await bodyText(app.page)).not.toContain('Goes with your cart')
  })
})
