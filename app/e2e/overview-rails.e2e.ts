import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import * as fx from './fixtures'

/**
 * What fills the Overview's two rails.
 *
 * This exists because the home page was EMPTY in production while /assets showed thousands of items. The
 * rails read the Shop-only feed (`/v3/catalog/shop`), which returns just the listings signed through the
 * Shop — nothing at all on a chain the Shop has not operated on yet — while the browse grid reads the
 * unified feed, which also carries the legacy MANA-priced liquidity converted to credits.
 *
 * Needs a real browser: the point is which endpoint the page chooses, so a stubbed fetch would assert the
 * stub. The harness serves the two feeds from different fixtures, which is what makes the choice observable.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

type Row = Record<string, unknown>
const unifiedRows = () => [...((fx.unifiedListings as { data: Row[] }).data ?? [])]

describe('the overview rails', () => {
  it('fills from the unified catalogue, so a legacy MANA-priced creation still appears', async () => {
    // A legacy row is MANA-priced (`manaWei` set) and absent from the Shop-only feed. Naming it distinctly
    // is what proves which feed answered: if the page were still reading `/v3/catalog/shop`, this name could
    // not be on screen no matter how many rows that fixture had.
    const legacyOnly = unifiedRows().find(r => r.manaWei) ?? unifiedRows()[0]
    const named = { ...legacyOnly, name: 'Legacy Era Jacket', tokenId: null, manaWei: '5000000000000000000' }

    app = await launchApp({
      path: '/overview',
      fixtures: {
        unifiedListings: { data: [named, ...unifiedRows().filter(r => r !== legacyOnly)] },
        // Deliberately EMPTY: production's state. The rails must not depend on it.
        shopListings: { data: [] }
      }
    })
    const { page } = app

    await waitForText(page, 'Featured Products')
    await waitForText(page, 'Legacy Era Jacket')
  })

  it('does not fall back to the empty state when only legacy liquidity exists', async () => {
    // The exact production symptom: "New drops are on the way" with a full catalogue one tab away.
    app = await launchApp({
      path: '/overview',
      fixtures: { shopListings: { data: [] } }
    })
    const { page } = app

    await waitForText(page, 'Featured Products')
    expect(await bodyText(page)).not.toMatch(/no items on sale right now/i)
  })

  it('keeps resales out of the rails, which promote creators', async () => {
    // Asserted through the server-side `listingType` filter rather than a client-side drop, so this also
    // pins that the harness applies it — a mock that ignored it would let a resale into a rail that
    // production never shows one in, and nothing would fail.
    const secondary = unifiedRows().find(r => r.tokenId)
    expect(secondary, 'fixture must contain a resale row for this to prove anything').toBeTruthy()

    app = await launchApp({ path: '/overview' })
    const { page } = app

    await waitForText(page, 'Featured Products')
    const cardNames = await page.$$eval('[data-testid="card"] [title]', els =>
      els.map(e => e.getAttribute('title') ?? '')
    )
    // A resale row carries no item name in this feed, so its card would render blank — the failure this
    // filter was originally added for.
    expect(cardNames.every(n => n.trim().length > 0)).toBe(true)
  })
})
