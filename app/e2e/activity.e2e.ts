import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { purchasesResponse, salesResponse } from './fixtures'

// Activity: the unified feed of the signed-in user's shop actions. Purchases render as order cards
// (one per checkout — the EXPIRED intent is filtered, and the SETTLED / PENDING rows are distinct
// orders → two cards with their pills + credit totals); secondary sales render as sale cards. The type
// filter narrows the feed to Purchases / Sales.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('activity', () => {
  it('renders purchases + sales in one feed and filters by type', async () => {
    app = await launchApp({
      path: '/activity',
      fixtures: { purchases: purchasesResponse, sales: salesResponse }
    })
    const { page } = app

    await waitForText(page, 'Activity')

    // Two purchase order cards (the EXPIRED one is filtered out) + one sale card.
    await page.waitForSelector('[data-testid="purchase-order"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="activity-sale"]', { timeout: 20000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="purchase-order"]').length === 2, {
      timeout: 20000
    })

    // Status badges: SETTLED → "Completed", PENDING → "Processing", the sale → "Sold".
    await waitForText(page, 'Completed')
    await waitForText(page, 'Processing')
    await waitForText(page, 'Sold')

    // Per-row credit amounts render (135 settled, 270 pending).
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).toContain('135')
    expect(body).toContain('270')

    // Filter to Sales → purchases hidden, the sale card stays.
    await page.click('[data-testid="activity-filter-sales"]')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="purchase-order"]').length === 0 &&
        document.querySelectorAll('[data-testid="activity-sale"]').length === 1,
      { timeout: 20000 }
    )

    // Filter to Purchases → the sale is hidden, both order cards return.
    await page.click('[data-testid="activity-filter-purchases"]')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="activity-sale"]').length === 0 &&
        document.querySelectorAll('[data-testid="purchase-order"]').length === 2,
      { timeout: 20000 }
    )
  })
})
