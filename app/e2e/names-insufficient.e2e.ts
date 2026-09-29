import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { creditsResponse } from './fixtures'
import { RESUME_NAME_KEY } from '../src/lib/resume-name'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

/**
 * Short of the ~270-credit NAME by less than the smallest pack, so all four packs still close the gap and
 * the picker renders as the design's full 2x2 (Figma 2996-434120).
 */
const SHORT = { ...creditsResponse, usd: { balanceCents: 2400, credits: 240 } }

const NAME_INPUT = '[aria-label="Search for a NAME"]'

// Search a NAME, claim it, and land on the top-up screen the modal opens when the balance is short.
async function openBuyCredits(viewport: { width: number; height: number }) {
  app = await launchApp({ path: '/items?category=names', names: true, fixtures: { credits: SHORT } })
  const { page } = app
  await page.setViewport(viewport)

  await waitForText(page, 'Get your unique NAME!')
  await page.waitForSelector(NAME_INPUT)
  await page.type(NAME_INPUT, 'pepitox')
  await clickWhenEnabled(page, 'button', /claim name/i)
  await waitForText(page, 'Insufficient Funds')
  return page
}

/**
 * The buy-NAME modal's no-funds screen.
 *
 * What it replaces is a dead end: a named shortfall above a disabled BUY NAME, leaving the buyer to find
 * the credits page themselves and then start the whole search again. Here the modal sells them the exact
 * credits they are missing and the credits page routes them straight back to this NAME.
 */
describe('buying a NAME without enough credits', () => {
  it('opens the Buy Credits screen with the pack picker instead of a disabled CTA', async () => {
    const page = await openBuyCredits({ width: 1280, height: 900 })

    await waitForText(page, 'Buy Credits')
    // The confirm step — and its re-entry gate — is not on this screen; there is nothing to confirm yet.
    expect(await page.$('[aria-label="Re-enter the NAME to confirm"]')).toBeNull()

    const screen = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid="credit-packs"] > button')]
      const badge = document.querySelector('[data-testid="pack-recommended"]')
      return {
        packs: tiles.map(t => (t.textContent || '').replace(/\s+/g, ' ').trim()),
        selected: tiles.findIndex(t => t.hasAttribute('data-on')),
        recommended: tiles.findIndex(t => t.contains(badge)),
        total: document.querySelector('[data-testid="topup-total-credits"]')?.textContent?.trim(),
        hasBuy: !!document.querySelector('[data-testid="name-buy-credits"]')
      }
    })

    // 270 - 240 = 30 short, so every pack closes it and the cheapest one is both badged and selected.
    expect(screen.packs).toHaveLength(4)
    expect(screen.recommended).toBe(0)
    expect(screen.selected).toBe(0)
    expect(screen.packs[0]).toContain('40')
    expect(screen.total).toBe('40')
    expect(screen.hasBuy).toBe(true)
  })

  /**
   * The badge hangs 12px above its tile, which is the one thing on this screen the shared checkout shell
   * has never had to fit. On a phone the tiles are a 2x2 grid, so the second row's badge hangs into the
   * row gap — it must clear the tile above it rather than sit on top of it.
   */
  it('keeps the packs two by two on a phone, with the Recommended badge clear of the tile above', async () => {
    const page = await openBuyCredits({ width: 390, height: 844 })

    const shape = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect()
      const tiles = [...document.querySelectorAll('[data-testid="credit-packs"] > button')]
      const badge = document.querySelector('[data-testid="pack-recommended"]')!
      const buy = document.querySelector('[data-testid="name-buy-credits"]')!
      const card = document.querySelector('[role="dialog"]')!
      return {
        tiles: tiles.map(t => {
          const r = box(t)
          return { top: Math.round(r.top), w: Math.round(r.width), right: Math.round(r.right) }
        }),
        badge: { top: Math.round(box(badge).top), left: Math.round(box(badge).left) },
        cta: { top: Math.round(box(buy).top), bottom: Math.round(box(buy).bottom) },
        card: { left: Math.round(box(card).left), right: Math.round(box(card).right) },
        viewport: window.innerHeight,
        docWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }
    })

    // Two rows of two, all the same box.
    const rows = [...new Set(shape.tiles.map(t => t.top))].sort((a, b) => a - b)
    expect(rows).toHaveLength(2)
    for (const top of rows) expect(shape.tiles.filter(t => t.top === top)).toHaveLength(2)
    expect(new Set(shape.tiles.map(t => t.w)).size).toBe(1)

    // The badge belongs to the first tile and hangs above it without leaving the card.
    expect(shape.badge.top).toBeLessThan(rows[0])
    expect(shape.badge.left).toBeGreaterThanOrEqual(shape.card.left)
    // The CTAs are on screen, not below the fold, and nothing pushes the page sideways.
    expect(shape.cta.bottom).toBeLessThanOrEqual(shape.viewport)
    expect(shape.docWidth).toBeLessThanOrEqual(shape.innerWidth)
  })

  /**
   * The whole loop from one click, on the rail local dev actually runs.
   *
   * With no Stripe key the checkout resolves WITHOUT a hosted URL, and the modal hands the order id to the
   * credits page exactly as Stripe's success_url would — so the grant lands and the resume fires without
   * ever leaving localhost. Landing on a bare `/credits` instead is the bug this covers: the page would have
   * had nothing to poll, and the top-up would finish with the NAME quietly forgotten.
   */
  it('completes the whole top-up and comes back to the NAME, from one click', async () => {
    const page = await openBuyCredits({ width: 1280, height: 900 })

    await page.click('[data-testid="name-buy-credits"]')

    // Handed off with the order, not dropped on the pack grid.
    await page.waitForFunction(() => window.location.pathname === '/credits', { timeout: 20000 })
    expect(await page.evaluate(() => window.location.search)).toMatch(/[?&]order=/)
    expect(await page.evaluate((key: string) => sessionStorage.getItem(key), RESUME_NAME_KEY)).toBe('pepitox')

    // …and routed back to the NAME once the credits land.
    await page.waitForFunction(() => window.location.search.includes('category=names'), { timeout: 40000 })
    await waitForText(page, 'Buy NAME', 30000)
    expect(await page.evaluate(() => window.location.pathname)).toBe('/items')
  })

  /**
   * The page behind the modal must not scroll, and the sticky sub-nav must not move.
   *
   * Both used to fail together, from one line: the modal set `body { overflow: hidden }`, which locks
   * nothing here (index.css sets `html { overflow-x: clip }`, and body's overflow only reaches the viewport
   * while html is visible) but DOES make body a scroll container — re-parenting the sticky sub-nav's scroll
   * context so the tabs dropped out of their pinned position the moment the modal opened. The app-wide
   * useDialogScrollLock is what locks the page; this modal only has to stop fighting it.
   */
  it('freezes the page behind it without dropping the sticky sub-nav', async () => {
    app = await launchApp({ path: '/items?category=names', names: true, fixtures: { credits: SHORT } })
    const { page } = app
    await page.setViewport({ width: 1280, height: 700 })
    await waitForText(page, 'Get your unique NAME!')

    // Scroll first, so the sub-nav is actually pinned and a drop would be visible.
    await page.evaluate(() => window.scrollTo(0, 400))
    await new Promise(r => setTimeout(r, 300))
    const navTop = () => page.$eval('[data-testid="subnav"]', el => Math.round(el.getBoundingClientRect().top))
    const before = await navTop()
    const scrollBefore = await page.evaluate(() => window.scrollY)

    await page.waitForSelector(NAME_INPUT)
    await page.type(NAME_INPUT, 'pepitox')
    await clickWhenEnabled(page, 'button', /claim name/i)
    await waitForText(page, 'Insufficient Funds')
    await new Promise(r => setTimeout(r, 300))

    // The sub-nav held its pinned position.
    expect(await navTop()).toBe(before)

    // A REAL wheel, not window.scrollBy: `overflow: hidden` stops the user but leaves programmatic
    // scrolling working, so scripting it would pass against a page with no lock at all.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden')
    await page.mouse.move(60, 400)
    await page.mouse.wheel({ deltaY: 600 })
    await new Promise(r => setTimeout(r, 200))
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  })

  /**
   * The return leg, which is the whole point of the screen: Stripe redirects to `/credits?order=…`, the
   * grant lands, and the buyer is put back on the NAME they could not afford — on the CONFIRM step, with
   * the re-entry field EMPTY, because a NAME they have not re-typed is a NAME they have not confirmed.
   */
  it('comes back to the same NAME on the confirm step once the credits land', async () => {
    app = await launchApp({ path: '/items?category=names', names: true, fixtures: { credits: SHORT } })
    const { page } = app

    await waitForText(page, 'Get your unique NAME!')
    // Same origin as the return URL below, so the seeded stash and the request mocks both survive it.
    await page.evaluate((key: string) => sessionStorage.setItem(key, 'pepitox'), RESUME_NAME_KEY)

    // The success URL Stripe sends the buyer to. pack_5 grants 40 credits → 240 + 40 clears the ~270 NAME.
    await page.goto(`${BASE}/credits?order=mock_cs_pack_5_1`, { waitUntil: 'networkidle2', timeout: 45000 })

    await waitForText(page, 'Buy NAME', 30000)
    const resumed = await page.evaluate((key: string) => {
      const input = (sel: string) => (document.querySelector(sel) as HTMLInputElement | null)?.value
      return {
        path: window.location.pathname + window.location.search,
        searched: input('[aria-label="Search for a NAME"]'),
        reentry: input('[aria-label="Re-enter the NAME to confirm"]'),
        // The top-up screen is gone — they can afford it now.
        stillShort: !!document.querySelector('[data-testid="credit-packs"]'),
        stash: sessionStorage.getItem(key)
      }
    }, RESUME_NAME_KEY)

    expect(resumed.path).toBe('/items?category=names')
    expect(resumed.searched).toBe('pepitox')
    expect(resumed.reentry).toBe('')
    expect(resumed.stillShort).toBe(false)
    // Consumed on the way through, so an unrelated top-up later is not bounced to this NAME.
    expect(resumed.stash).toBeNull()
  })
})
