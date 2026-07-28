import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION, ownedNfts } from './fixtures'

/**
 * Deep-linking a SECONDARY token (`/token/:contract/:tokenId`) as someone who does NOT own it.
 *
 * This path resolves last: the page first asks the owner-scoped query whether the viewer holds the token,
 * and only once that settles EMPTY does it fall back to a public lookup. That ordering left a window where
 * nothing was flagged as loading and the name was still blank — long enough to paint "This item isn't
 * available" over a perfectly valid item before it appeared. The flash is what these tests pin: an empty
 * state that shows up mid-load is worse than a slow one, because it tells the buyer the item is gone.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const TOKEN_ID = '42'
const TOKEN_PATH = `/token/${COLLECTION}/${TOKEN_ID}`
/** The viewer owns nothing; the token itself still exists and is publicly resolvable. */
const AS_BUYER = { ownedNfts: { data: [], total: 0 }, publicNfts: ownedNfts }

/**
 * Watch for the not-found copy from BEFORE the first paint. Polling from the test would race the very
 * window being tested, so the page records the sighting itself.
 */
async function watchForNotFound(page: App['page']) {
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as { __sawNotFound?: boolean }
    w.__sawNotFound = false
    const check = () => {
      if (/isn.t available/i.test(document.body?.innerText ?? '')) w.__sawNotFound = true
    }
    new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true })
    setInterval(check, 30)
  })
}

const sawNotFound = (page: App['page']) =>
  page.evaluate(() => (window as unknown as { __sawNotFound?: boolean }).__sawNotFound === true)

describe('deep-linking a token you do not own', () => {
  it('renders the item without ever flashing the not-available state', async () => {
    app = await launchApp({ path: '/overview', fixtures: AS_BUYER })
    const { page } = app
    await watchForNotFound(page)
    await page.goto(page.url().replace('/overview', TOKEN_PATH), { waitUntil: 'networkidle2' })

    await waitForText(page, 'Galaxy Hat')
    expect(await sawNotFound(page)).toBe(false)
  })

  it('shows the token as buyable, not as something the viewer manages', async () => {
    app = await launchApp({ path: TOKEN_PATH, fixtures: AS_BUYER })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    const text = await bodyText(page)
    // The owner's actions belong to the owner — a buyer must not see them on someone else's token.
    expect(text).not.toMatch(/remove from sale|edit price/i)
  })

  it('still reports a token that genuinely does not exist', async () => {
    // The fix must not turn "missing" into a permanent spinner: with nothing to resolve, the empty state
    // is the correct destination.
    app = await launchApp({
      path: `/token/${COLLECTION}/999999`,
      fixtures: { ownedNfts: { data: [], total: 0 }, publicNfts: { data: [], total: 0 } }
    })
    const { page } = app

    await waitForText(page, 'isn’t available', 30000)
  })
})
