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

    // Header + the four packs (see src/lib/payments.ts CREDIT_PACKS: $5.99/$11.99/$29.99/$59.99).
    await waitForText(page, 'Get credits')
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="pack"]').length)).toBe(4)
    await waitForText(page, '$5.99')
    await waitForText(page, '$59.99')
    /**
     * The bonus is now stated in the pack ACCESSIBLE LABEL, not as a visible pill.
     *
     * The struck-through baseline and the "+N bonus" pill were dropped in the home redesign: they
     * rendered as reserved empty space on every card. This used to wait for the visible word and timed
     * out at 20s once it was gone. packBonus() is still computed for the aria-label, so the assertion
     * moves there — it still pins the ladder shape, because a repricing that flattened the rate makes
     * packBonus() return null and the "more than" clause disappear.
     */
    const packLabels = await page.$$eval('[data-testid="pack"]', els =>
      els.map(e => e.querySelector('[aria-label]')?.getAttribute('aria-label') ?? e.getAttribute('aria-label') ?? '')
    )
    expect(packLabels.some(l => /more than/i.test(l))).toBe(true)
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

    // Pick the $29.99 pack (pack_25). No intermediate card form — mock checkout goes straight to
    // crediting (behaves like "went to Stripe → came back credited").
    await page.waitForSelector('[data-testid="pack"]', { timeout: 20000 })
    expect(await clickByText(page, '[data-testid="pack"]', /\$29\.99/)).toBe(true)

    // Processing → success: 260 credits granted for the $29.99 pack (break-even buy rate).
    await waitForText(page, 'successful')
    await waitForText(page, '260')

    // The purchase must actually raise the balance: the /dev/mint-usd top-up (260 credits = $26.00 of
    // spend value) folds into the credits refetch, so the sub-nav chip goes 500 → 760. No other test asserts this.
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('760'),
      {
        timeout: 20000
      }
    )
    expect(
      await page.evaluate(() =>
        document.querySelector('button[aria-label$=" shop credits"]')?.textContent?.includes('760')
      )
    ).toBe(true)
  })
})
