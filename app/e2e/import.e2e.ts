import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The migrate RUN itself stops short of its congrats screen under these mocks: taking the old listing
// down needs a real cancelSignature tx, and the first item parks on it forever. This spec therefore
// covers the page and the hand-off into the modal, not the outcome of the run. (It previously appeared
// to cover the outcome by waiting for "in the Shop", but that matched a section subtitle that was
// permanently on the page, so the wait returned before any listing had moved.)
describe('import old listings', () => {
  it('lists every importable item and hands the selection to the migrate modal', async () => {
    app = await launchApp({ path: '/import' })
    const { page } = app

    // One flat list of everything importable, headed by the count of items still to move.
    await waitForText(page, 'Bring your listings into the new shop!')
    await waitForText(page, 'Update Pricing')
    await waitForText(page, 'Galaxy Hat')
    await waitForText(page, 'Nebula Jacket')
    expect(await page.$eval('[data-testid="import-count"]', el => el.textContent)).toBe('2')

    // Auto-converted suggested prices live in the editable inputs (100 MANA → 270, 50 MANA → 135).
    const prices = await page.$$eval('[data-testid="imp-price-input"]', els =>
      els.map(e => (e as HTMLInputElement).value)
    )
    expect(prices).toContain('270')
    expect(prices).toContain('135')

    // List all → the migrate modal opens with both items queued at those prices.
    await clickWhenEnabled(page, 'button', /list all/i)
    await waitForText(page, 'Listing your items')
    const queued = await page.$eval('[data-testid="modal"]', el => (el as HTMLElement).innerText)
    expect(queued).toMatch(/Galaxy Hat/)
    expect(queued).toMatch(/Nebula Jacket/)
    expect(queued).toMatch(/1 of 2/)

    // The modal is centred in a fixed backdrop, so on a screen shorter than the card it overflowed in BOTH
    // directions at once, with nothing to scroll: its own top ended up above the scroll origin, out of
    // reach. 300px is short enough for the progress card (~333px) to need the cap.
    await page.setViewport({ width: 1000, height: 300 })
    const fit = await page.evaluate(() => {
      const box = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, viewport: window.innerHeight }
    })
    expect(fit.top, 'modal top above the viewport').toBeGreaterThanOrEqual(0)
    expect(fit.bottom, 'modal bottom past the viewport').toBeLessThanOrEqual(fit.viewport)
  })
})
