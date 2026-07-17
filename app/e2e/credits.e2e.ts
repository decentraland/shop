import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, clickWhenEnabled, waitForText } from './helpers/dom'

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
    await page.waitForSelector('.pack', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelectorAll('.pack').length)).toBe(4)
    await waitForText(page, '$5')
    await waitForText(page, '$50')
    await waitForText(page, 'Recommended')

    // The signed-in balance chip renders in the sub-nav (creditsResponse.usd.credits = 500).
    await page.waitForSelector('.subnav__balance', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelector('.subnav__balance')?.textContent?.includes('500'))).toBe(
      true
    )
  })

  it('buys a pack end-to-end and increases the sub-nav balance', async () => {
    app = await launchApp({ path: '/credits' })
    const { page } = app

    // Start balance: creditsResponse.usd.credits = 500.
    await page.waitForSelector('.subnav__balance', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelector('.subnav__balance')?.textContent?.includes('500'))).toBe(true)

    // Pick the $25 pack (mock checkout → in-app card form).
    await page.waitForSelector('.pack', { timeout: 20000 })
    expect(await clickByText(page, '.pack', /\$25/)).toBe(true)

    // Complete the mock card form (prefilled with the Stripe test card).
    await clickWhenEnabled(page, 'button', /pay \$25/i)

    // Processing → success: 250 credits granted for the $25 pack.
    await waitForText(page, 'successful')
    await waitForText(page, '250')

    // The purchase must actually raise the balance: the /dev/mint-usd top-up ($25 = 250 credits) folds
    // into the credits refetch, so the sub-nav chip goes 500 → 750. No other test asserts this.
    await page.waitForFunction(
      () => !!document.querySelector('.subnav__balance')?.textContent?.includes('750'),
      { timeout: 20000 }
    )
    expect(await page.evaluate(() => document.querySelector('.subnav__balance')?.textContent?.includes('750'))).toBe(true)
  })
})
