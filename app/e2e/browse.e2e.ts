import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('browse the shop', () => {
  it('shows credit-buyable listings', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.evaluate(() => document.body.innerText.includes('270'))).toBe(true) // credits price
  })

  it('filters by rarity (server-side)', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    expect(await clickByText(page, '.rarity-pill', /^legendary$/i)).toBe(true)
    // Only the legendary item (Nebula Jacket) remains; the epic one drops out.
    await page.waitForFunction(
      () => document.body.innerText.includes('Nebula Jacket') && !document.body.innerText.includes('Galaxy Hat'),
      { timeout: 15000 }
    )
    expect(await page.evaluate(() => document.body.innerText.includes('Nebula Jacket'))).toBe(true)
  })
})
