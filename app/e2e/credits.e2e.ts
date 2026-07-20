import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('get credits page', () => {
  it('renders the credit packs and the signed-in balance', async () => {
    app = await launchApp({ path: '/credits' })
    const { page } = app

    // Header + the four packs (see src/lib/payments.ts CREDIT_PACKS: $5/$10/$25/$50).
    await waitForText(page, 'Get credits')
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="pack"]').length)).toBe(4)
    await waitForText(page, '$5')
    await waitForText(page, '$50')
    await waitForText(page, 'Recommended')

    // The signed-in balance chip renders in the sub-nav (creditsResponse.usd.credits = 500).
    await page.waitForSelector('[data-testid="subnav-balance"]', { timeout: 20000 })
    expect(
      await page.evaluate(() => document.querySelector('[data-testid="subnav-balance"]')?.textContent?.includes('500'))
    ).toBe(true)
  })

  it('buys a pack end-to-end and increases the sub-nav balance', async () => {
    app = await launchApp({ path: '/credits' })
    const { page } = app

    // Start balance: creditsResponse.usd.credits = 500.
    await page.waitForSelector('[data-testid="subnav-balance"]', { timeout: 20000 })
    expect(
      await page.evaluate(() => document.querySelector('[data-testid="subnav-balance"]')?.textContent?.includes('500'))
    ).toBe(true)

    // Pick the $25 pack. No intermediate card form — mock checkout goes straight to crediting
    // (behaves like "went to Stripe → came back credited").
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await clickByText(page, '[data-testid="pack"]', /\$25/)).toBe(true)

    // Processing → success: 250 credits granted for the $25 pack.
    await waitForText(page, 'successful')
    await waitForText(page, '250')

    // The purchase must actually raise the balance: the /dev/mint-usd top-up ($25 = 250 credits) folds
    // into the credits refetch, so the sub-nav chip goes 500 → 750. No other test asserts this.
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="subnav-balance"]')?.textContent?.includes('750'),
      {
        timeout: 20000
      }
    )
    expect(
      await page.evaluate(() => document.querySelector('[data-testid="subnav-balance"]')?.textContent?.includes('750'))
    ).toBe(true)
  })
})
