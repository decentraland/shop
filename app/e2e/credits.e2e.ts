import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'

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
    await waitForText(page, 'Best value')

    // The signed-in balance chip renders in the sub-nav (creditsResponse.usd.credits = 500).
    await page.waitForSelector('[data-testid="subnav-balance"]', { timeout: 20000 })
    expect(
      await page.evaluate(() => document.querySelector('[data-testid="subnav-balance"]')?.textContent?.includes('500'))
    ).toBe(true)
  })
})
