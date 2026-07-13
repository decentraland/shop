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

  it('opens the item detail by clicking a card (whole-card overlay link)', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Clicking the favourite button must NOT navigate (nested control stays independent of the link).
    await page.click('.card .card__fav')
    expect(await page.evaluate(() => window.location.pathname)).toBe('/assets')

    // Clicking the card's overlay link navigates to that item's detail page.
    await page.click('.card .card__link')
    await page.waitForFunction(() => window.location.pathname.startsWith('/item/'), { timeout: 20000 })
    expect(await page.evaluate(() => window.location.pathname.startsWith('/item/'))).toBe(true)
  })

  it('filters by rarity (server-side)', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app
    await waitForText(page, 'Galaxy Hat')

    // Open the Rarity popover in the horizontal filter bar, then check "legendary".
    expect(await clickByText(page, '.filterbar__trigger', /rarity/i)).toBe(true)
    await page.waitForSelector('.filter-pop--rarity', { timeout: 5000 })
    expect(await clickByText(page, '.filter-pop__check', /^legendary$/i)).toBe(true)
    // Only the legendary item (Nebula Jacket) remains; the epic one drops out.
    await page.waitForFunction(
      () => document.body.innerText.includes('Nebula Jacket') && !document.body.innerText.includes('Galaxy Hat'),
      { timeout: 15000 }
    )
    expect(await page.evaluate(() => document.body.innerText.includes('Nebula Jacket'))).toBe(true)
  })
})
