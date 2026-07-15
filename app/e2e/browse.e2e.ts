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

  it('renders BOTH native (Add to cart) and legacy (≈ + Buy now) cards in the one unified grid', async () => {
    app = await launchApp({ path: '/assets' })
    const { page } = app

    // Both a native (Galaxy Hat, fixed price) and a legacy (Retro Cap) card are present.
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Retro Cap')
    // Legacy card shows the fluctuating INDICATIVE price (leading ≈) + a "Market price" chip.
    await waitForText(page, 'Market price')
    expect(await page.evaluate(() => document.body.innerText.includes('≈'))).toBe(true)

    // Each source drives its own action button (revealed on hover, so read textContent not innerText):
    // native → Add to cart, legacy → Buy now.
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.card__cart')].map(b => (b.textContent || '').trim().toLowerCase())
    )
    expect(labels.some(l => l.includes('add to cart'))).toBe(true)
    expect(labels.some(l => l.includes('buy now'))).toBe(true)
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

    // Rarity is a sidebar section (open by default); check "legendary".
    await page.waitForSelector('.rarity-filter', { timeout: 5000 })
    expect(await clickByText(page, '.rarity-filter__check', /^legendary$/i)).toBe(true)
    // Only the legendary item (Nebula Jacket) remains; the epic one drops out.
    await page.waitForFunction(
      () => document.body.innerText.includes('Nebula Jacket') && !document.body.innerText.includes('Galaxy Hat'),
      { timeout: 15000 }
    )
    expect(await page.evaluate(() => document.body.innerText.includes('Nebula Jacket'))).toBe(true)
  })
})
