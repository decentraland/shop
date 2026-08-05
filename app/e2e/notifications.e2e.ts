import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'

/**
 * The navbar notifications bell and its panel.
 *
 * Worth end-to-end coverage on two counts. The rows are NOT ours — they're decentraland-ui2's per-type
 * renderers, fed by the push-notifications service, and two failure modes have already shipped from that
 * seam (a white-screen on a notification whose `timestamp` date-fns couldn't parse, and a missing MUI
 * theme provider the shop doesn't otherwise mount). And the bell's position in the navbar's right-hand
 * group is a layout question only a real browser can answer — see the alignment block at the bottom.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const BELL = '[data-testid="notifications-bell"]'
const PANEL = '[data-testid="notifications-panel"]'
const ITEM = '[data-testid="notification-item"]'
const BADGE = '[data-testid="notifications-badge"]'

// MANA the mocked wallet reports, so the navbar shows BOTH currency amounts next to the bell.
const MANA_WEI = '1500000000000000000000'

async function openBell(page: App['page']) {
  await page.waitForSelector(BELL, { timeout: 20000 })
  await page.click(BELL)
  await page.waitForSelector(PANEL, { timeout: 10000 })
  // The panel slides in over 150ms; anything measuring its box has to wait that out or it reads the
  // animation's start frame (8px high) instead of the resting position.
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel)
      return !!el && el.getAnimations().every(a => a.playState === 'finished')
    },
    {},
    PANEL
  )
}

async function waitForClosed(page: App['page']) {
  await page.waitForFunction((sel: string) => !document.querySelector(sel), {}, PANEL)
}

/** One notification, with whatever timestamp shape the service happens to send. */
function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    type: 'item_sold',
    address: '0x0000000000000000000000000000000000000001',
    timestamp: 1750000000000,
    read: false,
    created_at: 1750000000000,
    updated_at: 1750000000000,
    // ui2 renders its OWN per-type copy from this metadata (it ignores a free-text description), so
    // nftName is what actually reaches the screen — which is exactly what makes it worth asserting.
    metadata: { link: '/activity', nftName: `Item ${id}` },
    ...over
  }
}

describe('notifications bell', () => {
  it('renders in the navbar and opens the panel without crashing', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await openBell(page)
    // The panel is the assertion: a render crash inside ui2 would leave the app blank instead.
    await waitForText(page, 'Someone just bought your Nebula Jacket')
    expect(await bodyText(page)).toMatch(/notifications/i)
    // ...and the app itself is still alive behind it.
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('survives a notification the service sent with an unparseable date', async () => {
    // The exact shape that white-screened the panel: date-fns throws "Invalid time value" and takes the
    // whole feature down. Unrenderable items must be dropped, and the renderable ones must still show.
    app = await launchApp({
      path: '/overview',
      fixtures: {
        notifications: {
          notifications: [
            notification('bad-null', { timestamp: null, created_at: null }),
            notification('bad-text', { timestamp: 'not a date', created_at: 'not a date' }),
            notification('bad-zero', { timestamp: 0, created_at: 0 }),
            notification('good', {
              timestamp: 1750000000000,
              metadata: { link: '/activity', nftName: 'Survivor Jacket' }
            })
          ]
        }
      }
    })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Survivor Jacket')
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('accepts second-precision and ISO timestamps, not just milliseconds', async () => {
    // The service is not consistent about units; both must render rather than being silently dropped.
    app = await launchApp({
      path: '/overview',
      fixtures: {
        notifications: {
          notifications: [
            notification('secs', { timestamp: 1750000000, metadata: { link: '/activity', nftName: 'Seconds Jacket' } }),
            notification('iso', {
              timestamp: '2026-06-15T10:00:00.000Z',
              metadata: { link: '/activity', nftName: 'Iso Jacket' }
            })
          ]
        }
      }
    })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Seconds Jacket')
    expect(await bodyText(page)).toMatch(/iso jacket/i)
  })

  it('renders the bell with an empty list when the service has nothing', async () => {
    app = await launchApp({ path: '/overview', fixtures: { notifications: { notifications: [] } } })
    const { page } = app

    await openBell(page)
    // No crash, no stale content, and the page still works.
    await waitForText(page, 'You have no notifications yet')
    expect(await bodyText(page)).not.toMatch(/someone just bought/i)
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('still renders the bell when the notifications service fails', async () => {
    // Every call degrades to an empty list by design — a 500 from the service must not cost the user
    // their navbar.
    app = await launchApp({ path: '/overview', errors: { '/notifications': { status: 500 } } })
    const { page } = app

    await openBell(page)
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('is absent when signed out — there is no one to notify', async () => {
    app = await launchApp({ path: '/overview', signedOut: true })
    const { page } = app

    await waitForText(page, 'Sign in')
    expect(await page.$(BELL)).toBeNull()
  })
})

describe('notifications panel', () => {
  it('is one chronological list with no seen/unseen tabs', async () => {
    app = await launchApp({
      path: '/overview',
      fixtures: {
        notifications: {
          notifications: [
            // Out of order on the wire, and mixed read/unread — the two things the old tabs used to
            // split apart. One list, newest first, is the whole contract now.
            notification('mid', {
              timestamp: 1749000000000,
              read: true,
              metadata: { link: '/activity', nftName: 'Mid Jacket' }
            }),
            notification('new', {
              timestamp: 1750000000000,
              read: false,
              metadata: { link: '/activity', nftName: 'New Jacket' }
            }),
            notification('old', {
              timestamp: 1748000000000,
              read: true,
              metadata: { link: '/activity', nftName: 'Old Jacket' }
            })
          ]
        }
      }
    })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'New Jacket')

    const rows = await page.$$eval(ITEM, els =>
      els.map(e => ({ text: e.textContent || '', unread: e.getAttribute('data-unread') }))
    )
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.text.match(/(New|Mid|Old) Jacket/)?.[0])).toEqual(['New Jacket', 'Mid Jacket', 'Old Jacket'])
    expect(rows.map(r => r.unread)).toEqual(['true', 'false', 'false'])

    // Exactly one scroll list, no tab widget, and none of the tabs' copy left behind.
    expect(await page.$$eval('[data-testid="notifications-list"]', els => els.length)).toBe(1)
    expect(await page.$$eval(`${PANEL} [role="tab"], ${PANEL} [role="tablist"]`, els => els.length)).toBe(0)
    const panelText = await page.$eval(PANEL, el => el.textContent || '')
    expect(panelText).not.toMatch(/newest|previous/i)
    expect(panelText).not.toMatch(/\bhistory\b/i)
  })

  it('gives each row its icon, title, linked body and a relative timestamp', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Someone just bought your Nebula Jacket')

    const first = await page.$$eval(ITEM, els => {
      const e = els[0]
      // ui2 wraps the whole description in a bare <a> with no href; the real inline link is the one that
      // actually points somewhere.
      const link = e.querySelector('a[href]')
      return {
        text: e.textContent || '',
        hasIcon: !!e.querySelector('svg, img'),
        linkText: link?.textContent || null,
        linkHref: link?.getAttribute('href') || null
      }
    })
    expect(first.hasIcon).toBe(true)
    expect(first.text).toMatch(/item sold/i)
    expect(first.linkText).toBe('Nebula Jacket')
    expect(first.linkHref).toBe('/activity')
    // date-fns formatDistanceToNow output, e.g. "about 1 year".
    expect(first.text).toMatch(/\b(seconds?|minutes?|hours?|days?|months?|years?)\b/i)
  })

  it('shows the unread dot while the panel is open, and clears it once it closes', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Nebula Jacket')
    // The default fixture is one unread + one read.
    expect(await page.$$eval(ITEM, els => els.map(e => e.getAttribute('data-unread')))).toEqual(['true', 'false'])
    expect(await page.$(BADGE)).not.toBeNull()

    // Marking happens on CLOSE, so reading the panel does not erase what was new while you read it.
    await page.click(BELL)
    await waitForClosed(page)
    expect(await page.$(BADGE)).toBeNull()

    await page.click(BELL)
    await page.waitForSelector(PANEL, { timeout: 10000 })
    expect(await page.$$eval(ITEM, els => els.map(e => e.getAttribute('data-unread')))).toEqual(['false', 'false'])
  })

  it('closes on an outside click and on Escape', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await openBell(page)
    await page.mouse.click(20, 500)
    await waitForClosed(page)

    await page.click(BELL)
    await page.waitForSelector(PANEL, { timeout: 10000 })
    await page.keyboard.press('Escape')
    await waitForClosed(page)
  })

  // The panel used to be a MUI Menu, i.e. a Modal, which locks page scroll: `overflow: hidden` on body
  // plus a compensating `padding-right` on body and on every `.mui-fixed` element. That padding is what
  // visibly slid the page sideways — the fixed navbar was compensated and stayed put while everything in
  // body moved. A plain positioned panel cannot reintroduce it, at either viewport.
  it('never freezes or shifts the page behind it', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    for (const [width, height] of [
      [1280, 900],
      [390, 844]
    ]) {
      await page.setViewport({ width, height })
      await openBell(page)
      await waitForText(page, 'Notifications')
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
      expect(await page.evaluate(() => document.body.style.paddingRight)).toBe('')
      await page.keyboard.press('Escape')
      await waitForClosed(page)
    }
  })

  it('is a full-bleed sheet flush under the navbar on mobile', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.setViewport({ width: 390, height: 844 })
    await openBell(page)
    await waitForText(page, 'Notifications')

    const { navBottom, panel, viewport } = await page.evaluate(() => {
      const nav = document.querySelector('nav')!.getBoundingClientRect()
      const p = document.querySelector('[data-testid="notifications-panel"]')!.getBoundingClientRect()
      return { navBottom: nav.bottom, panel: { top: p.top, left: p.left, right: p.right }, viewport: window.innerWidth }
    })
    expect(panel.top).toBeCloseTo(navBottom, 0)
    expect(panel.left).toBe(0)
    expect(panel.right).toBe(viewport)
  })
})

/**
 * Bell alignment in the navbar's right-hand group.
 *
 * The group is a flex row with `align-items: center`, so every item shares one centre line — the two
 * currency amounts, the bell and the avatar all sit on it, and that line (not the tallest element's box,
 * and not a text baseline) is the reference. The avatar's box is 52px against the bell's 24px, but its own
 * ink is centred on the same line, so aligning to the row's centre aligns to all three.
 *
 * This went wrong once already because the bell was wrapped in an INLINE element: that hands its vertical
 * position to baseline arithmetic instead of the flex row, and the resulting offset moves with the font
 * metrics at each zoom level (measured 3.4px–4.1px low across 1280–1920px). Hence the sweep over widths —
 * a single-width check would have passed a nudge that only looked right at one of them.
 */
describe('notifications bell alignment', () => {
  const WIDTHS = [1280, 1440, 1600, 1920]

  async function measure(page: App['page']) {
    return page.evaluate(() => {
      const centre = (r: DOMRect) => (r.top + r.bottom) / 2
      const bell = document.querySelector('[data-testid="notifications-bell"]')!
      const glyph = document.querySelector('[data-testid="notifications-bell-icon"]')!
      const group = bell.parentElement!.parentElement!.parentElement!
      const avatarHost = group.lastElementChild!
      const avatarInk = avatarHost.querySelector('svg, img')
      const badge = document.querySelector('[data-testid="notifications-badge"]')
      const g = glyph.getBoundingClientRect()
      return {
        rowCentre: centre(group.getBoundingClientRect()),
        bellCentre: centre(g),
        glyph: { top: g.top, bottom: g.bottom, left: g.left, right: g.right, height: g.height },
        neighbours: [
          ...[...document.querySelectorAll('nav button[aria-label]')]
            .filter(b => /credits$|MANA on /i.test(b.getAttribute('aria-label') || ''))
            .map(b => {
              const svg = b.querySelector('svg')
              return { label: b.getAttribute('aria-label') || '', centre: centre((svg ?? b).getBoundingClientRect()) }
            }),
          { label: 'avatar', centre: centre((avatarInk ?? avatarHost).getBoundingClientRect()) }
        ],
        badge: badge
          ? {
              top: badge.getBoundingClientRect().top,
              left: badge.getBoundingClientRect().left,
              right: badge.getBoundingClientRect().right
            }
          : null,
        avatarLeft: avatarHost.getBoundingClientRect().left
      }
    })
  }

  it('sits on the same centre line as the currency amounts and the avatar, at every width', async () => {
    app = await launchApp({ path: '/overview', manaBalanceWei: MANA_WEI })
    const { page } = app

    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 })
      await page.waitForSelector(BELL, { timeout: 20000 })
      await page.waitForSelector('nav button[aria-label$="shop credits"]', { timeout: 20000 })
      await page.evaluate(() => document.fonts.ready)

      const m = await measure(page)
      // Both currency amounts plus the avatar must have been found, or the loop below asserts nothing.
      expect(
        m.neighbours.map(n => n.label),
        `neighbours at ${width}px`
      ).toHaveLength(3)
      // EXACT, not approximate: a flex row centring a 24px box around a 24px glyph has no slack to spend,
      // so any drift at all means the glyph's box stopped being the box the row aligns. A loose tolerance
      // would be no guard — the offset this replaces was as small as 0.5px on some runs and 4px on others.
      expect(Math.abs(m.bellCentre - m.rowCentre), `bell vs row centre at ${width}px`).toBeLessThanOrEqual(0.01)
      // The neighbours get some slack: their own icons land up to 0.25px off from zoom rounding.
      for (const n of m.neighbours) {
        expect(Math.abs(m.bellCentre - n.centre), `bell vs ${n.label} at ${width}px`).toBeLessThanOrEqual(0.75)
      }
      // A 24px glyph — the same optical weight as the 20px currency icons, rather than a 35px box holding
      // a 15px bell, which is what made the old one read as both small and low.
      expect(m.glyph.height, `glyph height at ${width}px`).toBeCloseTo(24, 0)
    }
  })

  it('lets the unread badge overlap the bell instead of displacing it', async () => {
    app = await launchApp({ path: '/overview', manaBalanceWei: MANA_WEI })
    const { page } = app
    await page.setViewport({ width: 1440, height: 900 })
    await page.waitForSelector(BADGE, { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)

    const withBadge = await measure(page)
    expect(withBadge.badge).not.toBeNull()
    // Overlapping the bell's top-right corner, not parked beside it...
    expect(withBadge.badge!.left).toBeLessThan(withBadge.glyph.right)
    expect(withBadge.badge!.top).toBeLessThan(withBadge.glyph.top + withBadge.glyph.height / 2)
    // ...and clear of the avatar, so it doesn't close the gap between the two.
    expect(withBadge.badge!.right).toBeLessThan(withBadge.avatarLeft)

    // Opening and closing the panel marks everything read, which removes the badge. The glyph must not
    // move by so much as a pixel when it goes.
    await page.click(BELL)
    await page.waitForSelector(PANEL, { timeout: 10000 })
    await page.click(BELL)
    await page.waitForFunction((sel: string) => !document.querySelector(sel), {}, BADGE)

    const withoutBadge = await measure(page)
    expect(withoutBadge.badge).toBeNull()
    expect(withoutBadge.glyph).toEqual(withBadge.glyph)
  })
})
