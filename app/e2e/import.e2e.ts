import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('import old listings', () => {
  it('lists creations + owned items into the Shop, one at a time', async () => {
    app = await launchApp({ path: '/import' })
    const { page } = app

    // Both categories + both items, with auto-converted prices (100 MANA → ~270 credits).
    await waitForText(page, 'Your creations')
    await waitForText(page, 'Items you own')
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    // Auto-converted suggested prices live in the editable inputs (100 MANA → 270, 50 MANA → 135).
    const prices = await page.$$eval('[data-testid="imp-price-input"]', els =>
      els.map(e => (e as HTMLInputElement).value)
    )
    expect(prices).toContain('270')
    expect(prices).toContain('135')

    // List all → the migrate modal runs each item → congrats.
    await clickWhenEnabled(page, 'button', /list all/i)
    await waitForText(page, 'in the Shop', 40000)
    expect(await page.evaluate(() => /in the Shop/i.test(document.body.innerText))).toBe(true)
  })
})
