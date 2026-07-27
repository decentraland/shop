import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, unifiedListings } from './fixtures'

/**
 * The price shown for a SHOP-listed token, opened by someone who is not the seller.
 *
 * The token hydration paths take their money fields from the legacy MANA order on `/v1/nfts`, and a shop
 * listing is an off-chain USD-pegged TRADE that never appears there. So the trade resolved as buyable
 * while the price stayed 0, and the page rendered `PRICE 0` next to an enabled Buy now on a token listed
 * for real credits. Showing a price that isn't the price, beside a button that charges the real one, is
 * the worst version of this class of bug — hence a test at this level rather than a unit assertion.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/** Token 7 of the fixture collection is listed in the shop for 135 credits (unifiedListings, trade-2). */
const TOKEN_PATH = `/token/${COLLECTION}/7`
const LISTED_CREDITS = '135'

/**
 * The reported situation, faithfully: the viewer owns nothing, and the public NFT lookup DOES return the
 * token (name, image, collection) but with `order: null` — because a shop listing is an off-chain trade,
 * not a legacy MANA order. That null is where the 0 came from. The shop's own listing for this exact
 * token lives in the unified feed (trade-2, 135 credits).
 */
const publicTokenRow = {
  data: [
    {
      nft: {
        id: `${COLLECTION}-7`,
        contractAddress: COLLECTION,
        tokenId: '7',
        itemId: '1',
        name: 'Nebula Jacket',
        category: 'wearable',
        image: '',
        network: 'MATIC',
        chainId: 80002,
        data: { wearable: { rarity: 'legendary' } }
      },
      order: null
    }
  ],
  total: 1
}
const AS_OTHER_ACCOUNT = {
  ownedNfts: { data: [], total: 0 },
  publicNfts: publicTokenRow,
  unifiedListings
}

/** The price the sale block is showing, or '' while it is still a skeleton. */
const shownPrice = (page: App['page']) =>
  page.evaluate(() => {
    const el = document.querySelector('.item-detail__price')
    return (el as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? ''
  })

describe('a shop-listed token seen by another account', () => {
  it('shows the credits price from the shop listing, not 0', async () => {
    app = await launchApp({ path: TOKEN_PATH, fixtures: AS_OTHER_ACCOUNT })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await page.waitForFunction(
      expected => (document.querySelector('.item-detail__price') as HTMLElement | null)?.innerText.includes(expected),
      { timeout: 20000 },
      LISTED_CREDITS
    )
    expect(await shownPrice(page)).toContain(LISTED_CREDITS)
  })

  it('never renders a zero price on the way there', async () => {
    // The skeleton is the correct placeholder while the price is unknown. A literal 0 is not — it reads
    // as free. Recorded from before the first paint, because the window is a couple of frames wide.
    app = await launchApp({ path: '/overview', fixtures: AS_OTHER_ACCOUNT })
    const { page } = app
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as { __sawZero?: boolean }
      w.__sawZero = false
      const check = () => {
        const el = document.querySelector('.item-detail__price') as HTMLElement | null
        if (el && /(^|\s)0(\s|$)/.test(el.innerText.replace(/\s+/g, ' ').trim())) w.__sawZero = true
      }
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true })
      setInterval(check, 20)
    })
    await page.goto(page.url().replace('/overview', TOKEN_PATH), { waitUntil: 'networkidle2' })

    await waitForText(page, 'Nebula Jacket')
    await page.waitForFunction(
      expected => (document.querySelector('.item-detail__price') as HTMLElement | null)?.innerText.includes(expected),
      { timeout: 20000 },
      LISTED_CREDITS
    )
    expect(await page.evaluate(() => (window as unknown as { __sawZero?: boolean }).__sawZero === true)).toBe(false)
  })

  it('offers the buy actions once the price is known', async () => {
    app = await launchApp({ path: TOKEN_PATH, fixtures: AS_OTHER_ACCOUNT })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    // A buyer, not the seller: no owner management actions.
    expect(await bodyText(page)).not.toMatch(/remove from sale|edit price/i)
  })
})
