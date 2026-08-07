import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// The migrate RUN completes under these mocks (every async op resolves instantly), so a response delay
// on /v1/trades keeps the modal visible long enough to assert on its contents. This spec covers the tool
// and the hand-off into the modal, not the outcome of the run.
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
    // Delay /v1/trades so the MigrateModal stays visible while the cancel/re-list flow runs — without
    // this, every mock resolves instantly and the modal auto-closes before the test can assert on it.
    app = await launchApp({ path: '/import', delays: { '/v1/trades': 1500 } })
    const { page } = app

    await waitForText(page, 'Bring your listings into the new shop!')
    // Redirects to the shareable spelling — the one handed to creators.
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/activity?section=listings')

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
    // Atomic: wait for the modal AND capture its text in the same browser frame to avoid the race
    // between the modal rendering and the import flow auto-closing it on completion.
    const queued = await page.waitForFunction(
      () => {
        const modal = document.querySelector('[data-testid="modal"]')
        if (!modal) return null
        const text = (modal as HTMLElement).innerText
        return text.includes('Listing your items') ? text : null
      },
      { timeout: 15000 }
    ).then(h => h.jsonValue() as Promise<string>)
    expect(queued).toMatch(/Galaxy Hat/)
    expect(queued).toMatch(/Nebula Jacket/)
    // The QUEUE SIZE, not which item is active: the run really advances now (it used to freeze on the
    // first row under StrictMode's remount), so the index here is a race with the mocked cancel failing.
    expect(queued).toMatch(/\d of 2/)

    // The modal is centred in a fixed backdrop, so on a screen shorter than the card it overflowed in BOTH
    // directions at once, with nothing to scroll: its own top ended up above the scroll origin, out of
    // reach. 300px is short enough for the progress card (~333px) to need the cap.
    await page.setViewport({ width: 1000, height: 300 })
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    const fit = await page.evaluate(() => {
      const box = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, viewport: window.innerHeight }
    })
    expect(fit.top, 'modal top above the viewport').toBeGreaterThanOrEqual(0)
    expect(fit.bottom, 'modal bottom past the viewport').toBeLessThanOrEqual(fit.viewport)
  })
})
