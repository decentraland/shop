import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade, unifiedWithMint } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy an item with credits', () => {
  it('goes item detail → Buy now → Buy Item modal → purchase complete', async () => {
    // Deep-link the secondary item (Nebula Jacket, itemId 1). authorize is mocked; gasless is the
    // default, so the buyer signs the useCredits meta-tx (mock wallet) and it's POSTed to the mocked
    // relayer → canned hash → the modal reaches its "complete" state.
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    // Open the buy modal from the PDP.
    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')

    // Confirm in the modal (its own "Buy" button — exact, not "Buy now"). The modal opens in a loading
    // state (same "Buy Item" title) and only renders the enabled "Buy" button once the async
    // resolve-trade → authorize step reaches its ready phase, so wait for it rather than clicking early.
    await clickWhenEnabled(page, 'button', /^buy$/i)

    // The modal runs authorize → gasless buy → settlement, then shows the success state in place.
    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'was successful')
  })
})

/**
 * Buying a CREATOR'S OWN primary sale — a CollectionStore mint, which has no trade and never will.
 *
 * The item page used to hide Buy now for these (the modal could only resolve a trade), so a mint could be
 * bought from the cart and not from its own page, while a resale of the same item offered both. The buyer
 * cannot tell the two kinds apart, so what that looked like was a button that came and went.
 */
describe('buy a CollectionStore mint with credits', () => {
  it('goes item detail → Buy now → Buy Item modal → purchase complete, with no trade involved', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/3`, fixtures: { unifiedListings: unifiedWithMint } })
    const { page } = app

    await waitForText(page, 'Comet Boots')

    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')

    // The modal resolves the LIVE mint (price + remaining supply) instead of a trade, then authorizes and
    // settles through CollectionStore.buy inside the same useCredits call a listing uses.
    await clickWhenEnabled(page, 'button', /^buy$/i)

    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'was successful')
  })
})

/**
 * The post-purchase CTA is RUBY, and stays ruby.
 *
 * It used to turn violet, which is what got reported from a phone. The cause was one unqualified selector:
 * the purple variant's hover fill was written as `&:hover, &[data-variant='purple']:hover`, and that first
 * half painted every variant with no hover of its own. Ruby was the only one.
 *
 * Asserted as a COLOUR rather than as an attribute, because the markup was already correct — the button
 * carried data-variant="ruby" the whole time and still rendered violet. Only the computed fill could tell
 * the two apart.
 */
describe('the colour of the post-purchase cta', () => {
  it('stays ruby, hovered or not', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Item')
    await clickWhenEnabled(page, 'button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)

    const RUBY = 'rgb(255, 45, 85)'
    const fill = () =>
      page.evaluate(() => {
        const cta = [...document.querySelectorAll('a')].find(a => /try in world/i.test(a.textContent ?? ''))
        return cta ? getComputedStyle(cta).backgroundColor : null
      })

    expect(await fill()).toBe(RUBY)

    for (const a of await page.$$('a')) {
      if (/try in world/i.test(await a.evaluate(n => n.textContent ?? ''))) {
        await a.hover()
        break
      }
    }
    // The violet it used to become was rgb(122, 43, 191).
    expect(await fill()).toBe(RUBY)
  }, 120000)
})
