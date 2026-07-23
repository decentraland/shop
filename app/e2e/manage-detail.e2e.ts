import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByAria, clickByText, waitForText } from './helpers/dom'
import { buyTrade, ownedNftsOnSale } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('owner management on the item detail page', () => {
  it('shows the owner management actions for an owned, on-sale token and takes it off sale', async () => {
    // Start on My Assets with an owned token that's ALREADY on sale, then open its detail page. The
    // detail page re-checks ownership of that exact token (/v1/nfts → the on-sale fixture) and swaps
    // the buy CTAs for the owner management actions.
    app = await launchApp({
      path: '/my-assets',
      fixtures: { ownedNfts: ownedNftsOnSale, trade: buyTrade, importable: { data: [] } }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat #42')

    // Open the owned card's detail page (the whole-card link is aria-labelled with the item name).
    expect(await clickByAria(page, /galaxy hat #42/i)).toBe(true)

    // On the detail page the management actions render instead of Buy now / Add to cart: a listed item
    // you own offers "Update price" + "Remove from sale".
    await waitForText(page, 'Update price')
    await waitForText(page, 'Remove from sale')
    // The OWNER's CTA area shows management actions, not buy CTAs. The Resales section BELOW may show
    // "Buy now" for OTHER copies on sale — that's expected — so scope the check to the item's own info
    // column rather than the whole page.
    const infoText = await page.evaluate(() => document.querySelector('.item-detail__info')?.textContent ?? '')
    expect(/buy now/i.test(infoText)).toBe(false)

    // Take it down — fetchTrade(trade-2) → cancelListing → real cancelSignature through the mock wallet.
    expect(await clickByText(page, 'button', /remove from sale/i)).toBe(true)
    await waitForText(page, 'no longer for sale')
    const after = await page.evaluate(() => document.body.innerText)
    expect(/no longer for sale/i.test(after)).toBe(true)
    expect(/couldn.t remove the listing/i.test(after)).toBe(false)
  })
})
