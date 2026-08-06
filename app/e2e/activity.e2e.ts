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

    // Three purchase order cards + one sale card. Of the two EXPIRED intents only the SUBMITTED one shows:
    // the other was never spent, and showing those would fill the feed with purchases nobody made.
    await page.waitForSelector('[data-testid="purchase-order"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="activity-sale"]', { timeout: 20000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="purchase-order"]').length === 3, {
      timeout: 20000
    })

    // Status badges: SETTLED → "Completed", PENDING → "Processing", submitted-and-EXPIRED → "Failed",
    // the sale → "Sold".
    await waitForText(page, 'Completed')
    await waitForText(page, 'Processing')
    await waitForText(page, 'Failed')
    await waitForText(page, 'Sold')

    // A failed card explains itself, so the buyer is not left wondering where the credits went.
    await waitForText(page, 'credits are back in your balance')

    // Per-row credit amounts render (135 settled, 270 pending, 80 failed).
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).toContain('135')
    expect(body).toContain('270')
    expect(body).toContain('80')

    // Filter to Sales → purchases hidden, the sale card stays.
    await page.click('[data-testid="activity-filter-sales"]')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="purchase-order"]').length === 0 &&
        document.querySelectorAll('[data-testid="activity-sale"]').length === 1,
      { timeout: 20000 }
    )

    // Filter to Purchases → the sale is hidden, all three order cards return.
    await page.click('[data-testid="activity-filter-purchases"]')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="activity-sale"]').length === 0 &&
        document.querySelectorAll('[data-testid="purchase-order"]').length === 3,
      { timeout: 20000 }
    )
  })
})
