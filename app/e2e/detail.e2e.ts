import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('view an item and add it to the cart', () => {
  it('resolves a deep-linked item as buyable and adds it to the cart', async () => {
    // Deep-link (no router state) → the detail page hydrates from the shop feed by itemId.
    app = await launchApp({ path: `/item/${COLLECTION}/0` })
    const { page } = app

    await waitForText(page, 'Galaxy Hat')
    // Resolved as for sale → the buy CTAs render.
    await waitForText(page, 'Buy now')

    // Add to cart → the drawer confirms the add. Galaxy Hat is a PRIMARY (mint) item, so the button
    // stays "Add to cart" (re-clicking adds another copy) rather than flipping to a disabled "In cart".
    expect(await clickByText(page, 'button', /add to cart/i)).toBe(true)
    await waitForText(page, 'successfully added to cart')
    expect(
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b =>
          /add to cart/i.test(b.getAttribute('aria-label') || b.textContent || '')
        ) as HTMLButtonElement | undefined
        return !!btn && !btn.disabled
      })
    ).toBe(true)
  })
})
