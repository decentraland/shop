import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { buyTrade, ownedNftsOnSale } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('remove (cancel) a listing from the detail page', () => {
  it('opens an on-sale owned item from My Assets via MANAGE and takes it off sale', async () => {
    // An owned item that's ALREADY on sale (order carries a tradeId). Reaching its detail page via the
    // card's MANAGE cta, the "Remove from sale" click runs fetchTrade(tradeId) → cancelListing → real
    // ethers cancelSignature([onChainTrade]) through the mock wallet (eth_sendTransaction → canned hash
    // → success receipt). No importable → no banner.
    app = await launchApp({
      path: '/my-assets',
      fixtures: { ownedNfts: ownedNftsOnSale, trade: buyTrade, importable: { data: [] } }
    })
    const { page } = app

    // Redesigned My Assets: the owned wearables grid is the default section; the on-sale card's only
    // action is a MANAGE cta (removal moved to the detail page). The MANAGE cta is a hover-revealed
    // control (display:none at rest) so it's clickable via its DOM text even before it's painted.
    await waitForText(page, 'Galaxy Hat #42')

    // MANAGE → the item detail page, where an on-sale owned token offers "Remove from sale".
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)
    await waitForText(page, 'Remove from sale')

    // Take it down.
    expect(await clickByText(page, 'button', /remove from sale/i)).toBe(true)

    // Success toast — and no error surfaced (the encode/tx succeeded).
    await waitForText(page, 'no longer for sale')
    const body = await page.evaluate(() => document.body.innerText)
    expect(/no longer for sale/i.test(body)).toBe(true)
    expect(/couldn.t remove the listing/i.test(body)).toBe(false)
  })
})
