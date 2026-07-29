import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickByText, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy with insufficient funds', () => {
  it('opens the Buy Credits and Item state (pack picker) and never navigates to /success', async () => {
    // Deep-link the secondary item; force the credits-server authorize step to 402 (insufficient
    // funds). The buy modal treats that as "not enough credits" and shows the top-up pack picker
    // instead of a bare error — no dollars are reserved, no purchase happens.
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)

    // The modal reaches the no-funds state: header + insufficient-funds warning.
    await waitForText(page, 'Buy Credits and Item')
    await waitForText(page, 'Insufficient Funds')

    // Checkout never succeeded → we stay on the item page, never /success.
    expect(await page.evaluate(() => window.location.pathname)).toBe(`/item/${COLLECTION}/1`)
  })

  // The card had no height cap and centred itself in a fixed overlay: on a laptop screen at 100% zoom
  // the no-funds state grew past the viewport and took Cancel/Buy off-screen, with nothing to scroll.
  it('keeps the pack picker and its CTAs inside a short viewport', async () => {
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app
    // Roughly the page area a 1512x803 window leaves on a 14" laptop at 100% zoom.
    await page.setViewport({ width: 1512, height: 620 })

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)
    await waitForText(page, 'Insufficient Funds')

    const fit = await page.evaluate(() => {
      // The overlay's two children are the scrim (aria-hidden) and the card.
      const overlay = document.querySelector('[data-testid="buy-modal"]')!
      const card = [...overlay.children].find(el => !el.hasAttribute('aria-hidden'))!
      const c = card.getBoundingClientRect()
      const btns = [...document.querySelectorAll('button')].filter(b =>
        /^(buy|cancel)$/i.test((b.textContent || '').trim())
      )
      return {
        card: { top: c.top, bottom: c.bottom },
        viewport: window.innerHeight,
        ctas: btns.map(b => {
          const r = b.getBoundingClientRect()
          return { label: (b.textContent || '').trim(), top: r.top, bottom: r.bottom }
        })
      }
    })

    // The whole card fits the viewport…
    expect(fit.card.top).toBeGreaterThanOrEqual(0)
    expect(fit.card.bottom).toBeLessThanOrEqual(fit.viewport)
    // …and both CTAs are on screen, not below the fold.
    expect(fit.ctas.length).toBe(2)
    for (const cta of fit.ctas) {
      expect(cta.top, `${cta.label} top`).toBeGreaterThanOrEqual(0)
      expect(cta.bottom, `${cta.label} bottom`).toBeLessThanOrEqual(fit.viewport)
    }
  })
})
