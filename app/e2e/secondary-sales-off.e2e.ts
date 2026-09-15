import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION, ownedNfts, unifiedWithItem0Resale } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/**
 * The SHIPPED default: the Shop offers no secondary sales.
 *
 * Every other resale spec runs with the flag on, so without this one the default configuration — the one
 * that will actually be in production — would be the only state nothing covers. And the failure it guards
 * against is silent: a Sell button that reappears looks like a working feature, not like a bug.
 */
describe('with secondary sales off (the shipped default)', () => {
  it('should not offer to list an owned token for sale', async () => {
    app = await launchApp({ path: '/my-items', secondarySales: false, fixtures: { importable: { data: [] } } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat #42')
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)

    // The owner still reaches their token's page — they just cannot put it up for sale from the Shop.
    await waitForText(page, 'Galaxy Hat')
    expect(await bodyText(page)).not.toMatch(/put up for sale/i)
  })

  it('should show an owned token as owned, not as something to be notified about', async () => {
    // The regression this guards: hiding the listing CTA once dropped the owner out of the manage view
    // altogether, so their own token rendered the BUYER surface — "Not for sale", an email field to be
    // notified when it comes back in stock, and Make an offer, all for an asset already in their wallet.
    app = await launchApp({ path: '/my-items', secondarySales: false, fixtures: { importable: { data: [] } } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat #42')
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)
    await waitForText(page, 'Galaxy Hat')

    // Transfer is what remains: the one thing an owner can still do with a token they may not sell.
    await waitForText(page, 'Transfer')

    const text = await bodyText(page)
    expect(text).not.toMatch(/notify me/i)
    expect(text).not.toMatch(/make an offer/i)
    // Nor the buyer's "Not for sale" label — the owner knows; the manage CTAs carry the state.
    expect(text).not.toMatch(/not for sale/i)
  })

  it("should not offer to buy another owner's resale of an item", async () => {
    // The BUYER's half of the same default. The resale query is not even enabled, so the lowest-price
    // line and the way into the reseller list are both absent — one switch rather than a gate per surface.
    app = await launchApp({
      path: `/item/${COLLECTION}/0`,
      secondarySales: false,
      fixtures: { unifiedListings: unifiedWithItem0Resale }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    expect(await page.$('[data-testid="lowest-price"]')).toBeNull()
    expect(await page.$('[data-testid="view-resellers"]')).toBeNull()
  })

  it('should not make a DEEP-LINKED listed token buyable', async () => {
    /**
     * The hole a flag on the resale SURFACES never closed. `/token/:contract/:tokenId` hydrates from
     * /v1/nfts, which hands over the token's open order — and its tradeId — whatever the flag says, so the
     * page concluded "for sale" and rendered a Buy now under it. Reachable from a shared URL, a refresh,
     * or a link out of the Marketplace, with no resale surface involved at any point.
     */
    app = await launchApp({
      path: `/token/${COLLECTION}/42`,
      secondarySales: false,
      fixtures: { ownedNfts: { data: [], total: 0 }, publicNfts: ownedNfts }
    })
    const { page } = app

    // The page still renders the copy: the link is not broken, the purchase is simply not on offer here.
    await waitForText(page, 'Galaxy Hat')
    const text = await bodyText(page)
    expect(text).not.toMatch(/buy now/i)
    expect(text).not.toMatch(/add to cart/i)
    // And it keeps pointing at the place that can sell it today.
    await page.waitForSelector('[data-testid="buy-resale"]', { timeout: 20000 })
  })

  // NOTE: that the browse grid asks the server for `listingType=primary` is asserted in lib/api.spec.ts
  // instead. It is a wire-format guarantee, and requests fulfilled through CDP interception do not reliably
  // show up in the page's resource timing, so checking it here would test the harness, not the app.
})
