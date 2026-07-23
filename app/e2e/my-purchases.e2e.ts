import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { purchasesResponse } from './fixtures'

// My Purchases: renders the buyer's purchase history from GET /users/:addr/purchases, grouped into one
// order card per checkout. The fixture has one SETTLED + one PENDING + one EXPIRED row; EXPIRED is
// filtered out, and the SETTLED / PENDING rows are distinct orders (different status), so exactly two
// order cards render with their status pills + credit totals.

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('my purchases', () => {
  it('renders the order cards with status pills and credit amounts', async () => {
    app = await launchApp({ path: '/my-purchases', fixtures: { purchases: purchasesResponse } })
    const { page } = app

    await waitForText(page, 'My Purchases')

    // Two order cards (the EXPIRED one is filtered out).
    await page.waitForSelector('[data-testid="purchase-order"]', { timeout: 20000 })
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="purchase-order"]').length === 2,
      { timeout: 20000 }
    )
    expect(
      await page.evaluate(() => document.querySelectorAll('[data-testid="purchase-order"]').length)
    ).toBe(2)

    // Order count reflects the two order cards.
    await waitForText(page, '2 orders')

    // Status badges: the SETTLED row shows "Completed", the PENDING row shows "Processing".
    await waitForText(page, 'Completed')
    await waitForText(page, 'Processing')

    // The per-row credit amounts render (135 for the settled row, 270 for the pending row).
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).toContain('135')
    expect(body).toContain('270')
  })
})
