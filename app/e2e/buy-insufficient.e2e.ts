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

  /**
   * On a phone the four packs are a 2x2 (Figma mobile frame).
   *
   * They used to be flex tiles that wrapped, which let each tile's own content decide the row break: a
   * pack wide enough to render "260 ($29.99)" stopped sharing a line and took a full row, so the four
   * came out 2/1/1 and three rows tall. That third row is also what pushed the running total under the
   * sticky CTAs, which cover it rather than scroll past it.
   */
  it('lays the packs out two by two on a phone, with the total clear of the CTAs', async () => {
    app = await launchApp({
      path: `/item/${COLLECTION}/1`,
      fixtures: { trade: buyTrade },
      errors: { '/credits/authorize': { status: 402, body: { error: 'insufficient funds' } } }
    })
    const { page } = app
    await page.setViewport({ width: 390, height: 844 })

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')
    expect(await clickByText(page, 'button', /buy now/i)).toBe(true)
    await waitForText(page, 'Insufficient Funds')

    const shape = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid="credit-packs"] > button')]
      const box = (el: Element) => el.getBoundingClientRect()
      const totalRow = [...document.querySelectorAll('div')].find(d =>
        /^\$/.test((d.lastElementChild?.textContent || '').trim())
      )
      const buy = [...document.querySelectorAll('button')].find(b => /^buy$/i.test((b.textContent || '').trim()))!
      return {
        tiles: tiles.map(t => {
          const r = box(t)
          return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }
        }),
        totalBottom: totalRow ? Math.round(box(totalRow).bottom) : null,
        ctaTop: Math.round(box(buy).top)
      }
    })

    expect(shape.tiles).toHaveLength(4)
    // Two distinct rows, two tiles on each.
    const rows = [...new Set(shape.tiles.map(t => t.top))].sort((a, b) => a - b)
    expect(rows).toHaveLength(2)
    for (const top of rows) expect(shape.tiles.filter(t => t.top === top)).toHaveLength(2)
    // Columns line up and the tiles are the same box — no tile is wider for having a longer price.
    const widths = new Set(shape.tiles.map(t => t.w))
    expect(widths.size, `tile widths: ${[...widths]}`).toBe(1)
    for (const t of shape.tiles) expect(t.h, 'tile height').toBe(83)
    // The running total is readable, not sitting under the sticky CTA bar.
    expect(shape.totalBottom).not.toBeNull()
    expect(shape.totalBottom!).toBeLessThanOrEqual(shape.ctaTop)

    /**
     * And the 2x2 must be the CONTAINER's decision, not the content's.
     *
     * This is the actual regression: the tiles used to wrap, so the row break was whatever each tile's
     * own text happened to measure — the layout held only while the amounts stayed short. Widening one
     * price is what the real catalogue does to us, and it must not move anything.
     */
    const afterWidening = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid="credit-packs"] > button')]
      tiles[0].lastElementChild!.textContent = '($1,234,567.89)'
      void document.body.offsetHeight
      return tiles.map(t => {
        const r = t.getBoundingClientRect()
        return { top: Math.round(r.top), w: Math.round(r.width) }
      })
    })

    expect([...new Set(afterWidening.map(t => t.top))], 'rows after widening a price').toHaveLength(2)
    expect([...new Set(afterWidening.map(t => t.w))], 'tile widths after widening a price').toHaveLength(1)
  })
})
