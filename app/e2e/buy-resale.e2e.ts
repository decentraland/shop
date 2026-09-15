import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, clickWhenEnabled, waitForText } from './helpers/dom'
import {
  COLLECTION,
  buyTrade,
  marketplaceResaleTrade,
  unifiedWithItem0Resale,
  unifiedWithMarketplaceResale
} from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/**
 * THE COMBINATION THE FEATURE SHIPS AS: the Shop SELLS resales and TAKES none.
 *
 * Every other resale spec runs with `shop-secondary-sales` on, which grants both halves — so it cannot
 * tell the halves apart, and neither could a single flag. Here the buy permission is on and the listing
 * permission is off, which is the state production will run in, and the two things that must both hold:
 *
 *  - a buyer can find a resale, open it, and pay for it with credits;
 *  - an owner is still not offered any way to list, re-price or migrate one.
 *
 * The opposite corner — both permissions off — is covered by `secondary-sales-off.e2e.ts`.
 */
const withItem0Resale = { unifiedListings: unifiedWithItem0Resale }
const BUY_ONLY = { secondaryPurchases: true, secondarySales: false } as const

async function openResellers(page: App['page']): Promise<void> {
  await page.waitForSelector('[data-testid="view-resellers"]', { timeout: 20000 })
  await page.evaluate(() =>
    document.querySelector('[data-testid="view-resellers"]')?.scrollIntoView({ block: 'center' })
  )
  await page.click('[data-testid="view-resellers"]')
  await page.waitForSelector('[data-testid="resellers-modal"]', { timeout: 20000 })
}

describe('with secondary purchases on and secondary listing off', () => {
  it('should let a buyer pay for a resale with credits', async () => {
    app = await launchApp({
      path: `/item/${COLLECTION}/0`,
      ...BUY_ONLY,
      fixtures: { ...withItem0Resale, trade: buyTrade }
    })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    // The row actions reveal on hover (always visible where there is no hover).
    await page.hover('[data-testid="resale-row"]')
    await page.click('[data-testid="resale-buy"]')

    // Scope the confirm to the buy dialog — the resale row behind it carries its own "Buy" pill.
    await waitForText(page, 'Buy Item')
    await clickWhenEnabled(page, '[data-testid="buy-modal"] button', /^buy$/i)
    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'was successful')
  })

  it('should surface the cheapest resale on the item page', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, ...BUY_ONLY, fixtures: withItem0Resale })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    // The discovery half: a price to compare against and a way into the full list.
    await page.waitForSelector('[data-testid="lowest-price"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="view-resellers"]', { timeout: 20000 })
  })

  it('should let a buyer add a resale to the cart', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, ...BUY_ONLY, fixtures: withItem0Resale })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    await page.hover('[data-testid="resale-row"]')
    await page.click('[data-testid="resale-add"]')

    await waitForText(page, 'successfully added to cart')
  })

  it('should still refuse to let an owner list their own token', async () => {
    // The whole point of splitting the flags. Buying being on must not reopen the seller's side — a
    // listing signed here is indistinguishable from one the Sell flow would have signed.
    app = await launchApp({ path: '/my-items', ...BUY_ONLY, fixtures: { importable: { data: [] } } })
    const { page } = app

    await waitForText(page, 'Galaxy Hat #42')
    expect(await clickByText(page, 'button', /manage/i)).toBe(true)
    await waitForText(page, 'Galaxy Hat')

    // Transfer remains — the one thing an owner can still do with a token they may not sell.
    await waitForText(page, 'Transfer')
    const text = await bodyText(page)
    expect(text).not.toMatch(/put up for sale/i)
    expect(text).not.toMatch(/edit price/i)
  })
})

/**
 * THE RECORRIDO THIS FEATURE IS FOR: a resale listed through the classic MARKETPLACE, priced in MANA.
 *
 * The spec above buys a NATIVE (USD-pegged) resale, which is the shape the Shop signs itself — and the
 * Shop does not take resale listings, so that set is empty in practice. The row that actually arrives once
 * `includeLegacySecondary` opens the server's legacy branch is a `public_nft_order` whose `received` asset
 * is a plain ERC20: priced by the oracle, and settled through MarketCheckout rather than the cart, because
 * the cart assumes fixed credit prices and a MANA line's price floats with the rate.
 *
 * Nothing in the suite covered that path — even the existing `legacyTrade` fixture is USD-pegged
 * (assetType 2), so the ERC20 branch of `lineUsdCents` had no end-to-end cover at all.
 */
describe('buying a MANA-priced resale listed through the Marketplace', () => {
  const FIXTURES = { unifiedListings: unifiedWithMarketplaceResale, trade: marketplaceResaleTrade }

  it('should price it from the oracle and settle it with Credits', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/0`, ...BUY_ONLY, fixtures: FIXTURES })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    await openResellers(page)
    await page.waitForSelector('[data-testid="resale-row"]', { timeout: 20000 })

    // The legacy row is Buy-only and marks its price approximate, because the rate moves under it.
    const legacyRow = await page.evaluate(() => {
      const row = [...document.querySelectorAll('[data-testid="resale-row"]')].find(
        r => r.getAttribute('data-source') === 'legacy'
      )
      return row
        ? { hasAdd: !!row.querySelector('[data-testid="resale-add"]'), text: (row.textContent || '').trim() }
        : null
    })
    expect(legacyRow).not.toBeNull()
    // No cart button for a MANA line — the cart cannot hold a price that floats.
    expect(legacyRow!.hasAdd).toBe(false)

    await page.evaluate(() => {
      const row = [...document.querySelectorAll('[data-testid="resale-row"]')].find(
        r => r.getAttribute('data-source') === 'legacy'
      )
      ;(row?.querySelector('[data-testid="resale-buy"]') as HTMLButtonElement | undefined)?.click()
    })

    // MarketCheckout, not the shop's BuyModal: a separate dialog that resolves the trade and locks the
    // oracle price before it can offer Confirm, so wait for the dialog rather than for the button.
    await page.waitForSelector('[role="dialog"][aria-modal="true"][aria-label^="Buy "]', { timeout: 20000 })
    await waitForText(page, 'Confirm purchase', 20000)
    expect(await clickByText(page, 'button', /confirm purchase/i)).toBe(true)
    // MarketCheckout settles and routes to the receipt page (it does not finish inline like BuyModal).
    await page.waitForFunction(() => window.location.pathname === '/success', { timeout: 30000 })
    await waitForText(page, 'was successful')

    // The money half: it reserved a USD credit and relayed a useCredits meta-tx, so the buyer paid in
    // Credits. Nothing pulled MANA from them — the MANA in this listing is what the SELLER receives.
    expect(app.posts.some(p => p.includes('/credits/authorize'))).toBe(true)
    expect(app.metaTxBodies.length).toBeGreaterThan(0)
  })
})
