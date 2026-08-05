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
// covers the tool and the hand-off into the modal, not the outcome of the run. (It previously appeared
// to cover the outcome by waiting for "in the Shop", but that matched a section subtitle that was
// permanently on the page, so the wait returned before any listing had moved.)
describe('move old listings', () => {
  it('reaches the tool from the Activity chip, badged with what is left to move', async () => {
    app = await launchApp({ path: '/activity' })
    const { page } = app

    await waitForText(page, 'Activity')

    // The chip sits at the end of the filter row, carrying the count of listings still on MANA pricing.
    await page.waitForSelector('[data-testid="activity-filter-migrate"]', { timeout: 20000 })
    expect(await page.$eval('[data-testid="activity-migrate-count"]', el => el.textContent)).toBe('2')

    await page.click('[data-testid="activity-filter-migrate"]')
    await waitForText(page, 'Bring your listings into the new shop!')
    // The feed is gone, replaced by the tool.
    expect(await page.$('[data-testid="purchase-order"]')).toBeNull()
  })

  it('lists every importable item and hands the selection to the migrate modal', async () => {
    // /import was the tool's own route for months (the My Items nudge still points at it), so it has
    // to keep landing on the tool — not on the feed, and not on a 404.
    app = await launchApp({ path: '/import' })
    const { page } = app

    await waitForText(page, 'Bring your listings into the new shop!')
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/activity?view=migrate')

    // One flat list of everything importable, headed by the count of items still to move.
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

    // Select all drives every row's checkbox in one go, in both directions.
    const rowChecks = () =>
      page.$$eval('[data-testid="import-row-check"]', els => els.map(e => (e as HTMLInputElement).checked))
    expect(await rowChecks()).toEqual([true, true])
    await page.click('[data-testid="import-select-all"]')
    expect(await rowChecks()).toEqual([false, false])
    await page.click('[data-testid="import-select-all"]')
    expect(await rowChecks()).toEqual([true, true])

    // List all → the migrate modal opens with both items queued at those prices.
    // By test id, not by label: the cta's copy carries the selected count, so a text matcher breaks
    // every time the wording around the number changes.
    await clickWhenEnabled(page, '[data-testid="import-list-all"]', /./)
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
