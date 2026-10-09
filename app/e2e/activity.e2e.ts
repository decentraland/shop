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

  it("lists Credits a studio gave and Decentraland's own grant under All, and nowhere else", async () => {
    app = await launchApp({
      path: '/activity',
      fixtures: {
        creditOrders: {
          total: 0,
          orders: [],
          earnings: { total: 0, availableCents: 0, items: [] },
          gifts: {
            total: 2,
            items: [
              { id: 'gift-1', credits: 5, usdCents: 50, createdAt: Date.UTC(2026, 9, 9), studioName: 'QA Studio' },
              { id: 'grant-1', credits: 125, usdCents: 1250, createdAt: Date.UTC(2026, 8, 1), studioName: null }
            ]
          }
        }
      }
    })
    const { page } = app

    await page.waitForSelector('[data-testid="credit-gift"]', { timeout: 20000 })
    const gifts = await page.$$eval('[data-testid="credit-gift"]', els => els.map(e => e.textContent || ''))
    expect(gifts).toEqual([
      expect.stringMatching(/Gift from QA Studio.*\+.*5/),
      expect.stringMatching(/Gift from Decentraland.*\+.*125/)
    ])

    await page.click('[data-testid="activity-filter-purchases"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="credit-gift"]').length === 0, {
      timeout: 20000
    })
  })
})
