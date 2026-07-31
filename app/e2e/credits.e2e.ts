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

    // Header + the four packs (see src/lib/payments.ts CREDIT_PACKS: $4.99/$9.99/$24.99/$49.99).
    await waitForText(page, 'Get credits')
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="pack"]').length)).toBe(4)
    await waitForText(page, '$4.99')
    await waitForText(page, '$49.99')
    await waitForText(page, 'Recommended')

    // The signed-in balance chip renders in the global navbar (creditsResponse.usd.credits = 500).
    await page.waitForSelector('button[aria-label$=" shop credits"]', { timeout: 20000 })
    expect(
      await page.evaluate(() =>
        document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('500')
      )
    ).toBe(true)
  })

  it('buys a pack end-to-end and increases the navbar balance', async () => {
    app = await launchApp({ path: '/credits' })
    const { page } = app

    // Start balance: creditsResponse.usd.credits = 500.
    await page.waitForSelector('button[aria-label$=" shop credits"]', { timeout: 20000 })
    expect(
      await page.evaluate(() =>
        document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('500')
      )
    ).toBe(true)

    // Pick the $24.99 pack (pack_25). No intermediate card form — mock checkout goes straight to
    // crediting (behaves like "went to Stripe → came back credited").
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await clickByText(page, '[data-testid="pack"]', /\$24\.99/)).toBe(true)

    // Processing → success: 235 credits granted for the $24.99 pack (break-even buy rate).
    await waitForText(page, 'successful')
    await waitForText(page, '235')

    // The purchase must actually raise the balance: the /dev/mint-usd top-up (235 credits = $23.50 of
    // spend value) folds into the credits refetch, so the navbar chip goes 500 → 735. No other test asserts this.
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('735'),
      {
        timeout: 20000
      }
    )
    expect(
      await page.evaluate(() =>
        document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('735')
      )
    ).toBe(true)
  })
})
