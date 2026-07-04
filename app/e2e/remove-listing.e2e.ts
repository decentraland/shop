import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { buyTrade, ownedNftsOnSale } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('remove (cancel) a listing', () => {
  it('takes an owned item off sale from My Assets', async () => {
    // An owned item that's ALREADY on sale (order carries a tradeId). Its "Remove listing" click runs
    // fetchTrade(tradeId) → cancelListing → real ethers cancelSignature([onChainTrade]) through the
    // mock wallet (eth_sendTransaction → canned hash → success receipt). No importable → no banner.
    app = await launchApp({
      path: '/my-assets',
      fixtures: { ownedNfts: ownedNftsOnSale, trade: buyTrade, importable: { data: [] } }
    })
    const { page } = app

    // Session restored (else My Assets shows a sign-in prompt) + the on-sale card shows.
    await waitForText(page, 'Items you own')
    await waitForText(page, 'Galaxy Hat #42')
    await waitForText(page, 'On sale')

    // Take it down.
    expect(await clickByText(page, 'button', /remove listing/i)).toBe(true)

    // Success toast — and no error surfaced (the encode/tx succeeded).
    await waitForText(page, 'no longer for sale')
    const body = await page.evaluate(() => document.body.innerText)
    expect(/no longer for sale/i.test(body)).toBe(true)
    expect(/couldn.t remove the listing/i.test(body)).toBe(false)
  })
})
