import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Page } from 'puppeteer'
import { hermeticViteEnv, launchApp, type App } from './helpers/app'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

/**
 * THE HOME PAGE MUST NOT MOVE WHILE IT LOADS.
 *
 * Its sections read four different feeds and paint as each answers, so any section that renders nothing
 * while it waits arrives by shoving whatever is already on screen downwards. Three did: the second
 * carousel (gated on a row count only the answer can give), the whole "Buy the Look" row (a bare
 * `return null` for its loading state), and every rail's page-indicator strip (12px of dots plus 12px of
 * margin, appearing with the cards). Against origin/main this spec measured the last section heading at
 * y=849 on first paint and y=1783 settled — 934px of page sliding under the reader, 1067px at 375px.
 *
 * It needs a real browser twice over: the numbers are layout, and CLS only exists in one. The feeds are
 * staggered (helpers/app `delays`) because every mock here answers in under a millisecond otherwise, which
 * would put the whole page in one frame and hide the very state this is about.
 *
 * Boots its OWN vite server: the outfits row is dark unless a shop-server host is configured, and the
 * shared e2e server ships none (see outfits.e2e.ts, same reason).
 */

const PORT = Number(process.env.E2E_LAYOUT_PORT ?? 5294)
const BASE = `http://localhost:${PORT}`
let server: ChildProcess | undefined

// What each section reserves with. Six per carousel (one more than the five cards the widest tier shows,
// so a loading rail is full at every breakpoint), five looks, four creator cards.
const PER_RAIL = 6
const OUTFIT_SKELETONS = 5
const CREATOR_SKELETONS = 4

// The last section heading on the page: everything above it has to hold its height for this to stay put.
const LANDMARK = 'top creators'

// Staggered so the page is observed in the state a visitor on a slow connection sees: rails first, then
// looks, then the ranking — each one a chance for the sections above it to move what is below.
const DELAYS = {
  '/v3/catalog/unified': 600,
  // The trending rail has its OWN query, so it needs its own delay: left instant it filled before the first
  // sample and the reserved state these specs are about never existed for it.
  '/v3/catalog/trending': 900,
  '/v1/outfits': 1200,
  '/v1/rankings/': 1800,
  '/v2/catalog': 600
}

// Installed before anything renders: a layout-shift observer plus an rAF sampler that records where the
// landmark heading sits from the very first frame it exists in. Reading positions after the fact cannot
// answer "where was this at first paint".
const RECORDER = `
(() => {
  window.__layout = { cls: 0, shifts: 0, first: null, last: null, min: Infinity, max: -Infinity }
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry
        if (shift.hadRecentInput) continue
        window.__layout.cls += shift.value
        window.__layout.shifts += 1
        window.__layout.sources = (window.__layout.sources || []).concat(
          (shift.sources || []).map(s => {
            const n = s.node
            const el = n && n.nodeType === 1 ? n : (n && n.parentElement)
            return {
              value: shift.value,
              tag: el ? el.tagName : String(n),
              testid: el ? el.getAttribute('data-testid') : null,
              cls: el ? (el.className || '').toString().slice(0, 40) : null,
              text: el ? (el.textContent || '').trim().slice(0, 30) : null
            }
          })
        )
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch (e) {
    window.__layout.unsupported = String(e)
  }
  const sample = () => {
    const heading = [...document.querySelectorAll('h2')].find(h =>
      (h.textContent || '').toLowerCase().includes('${LANDMARK}')
    )
    if (heading) {
      const y = Math.round(heading.getBoundingClientRect().top + window.scrollY)
      const l = window.__layout
      if (l.first === null) l.first = y
      l.last = y
      if (y < l.min) l.min = y
      if (y > l.max) l.max = y
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})()
`

// Where every section heading sits, so a failure names the section that moved rather than just the total.
const HEADINGS = `(() => {
  const at = re => {
    const el = [...document.querySelectorAll('h2')].find(h => new RegExp(re, 'i').test(h.textContent || ''))
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
  }
  return {
    trending: at('trending products'),
    newCreations: at('new creations'),
    buyTheLook: at('the look'),
    topCreators: at('${LANDMARK}'),
    docHeight: document.documentElement.scrollHeight
  }
})()`

beforeAll(async () => {
  const vite = resolve(process.cwd(), 'node_modules/.bin/vite')
  server = spawn(vite, ['--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: hermeticViteEnv({ VITE_SHOP_SERVER_URL: 'http://localhost:5004' })
  })
  const deadline = Date.now() + 90000
  for (;;) {
    try {
      const res = await fetch(`${BASE}/`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`layout e2e server did not start on ${BASE}`)
    await new Promise(r => setTimeout(r, 500))
  }
}, 120000)

afterAll(() => {
  if (server && !server.killed) server.kill('SIGTERM')
})

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const THUMB = 'e2e' + '0'.repeat(61)

// 30 primary rows: enough that both rails fill (the second needs more than 12) — production's shape.
function listing(i: number) {
  return {
    tradeId: `trade-${i}`,
    listingType: 'primary',
    contractAddress: COLLECTION,
    itemId: String(i),
    tokenId: null,
    name: `Galaxy Item ${i}`,
    thumbnail: '',
    rarity: 'epic',
    category: 'wearable',
    wearableCategory: 'hat',
    creator: CREATOR_ADDRESS,
    priceCredits: 100 + i,
    available: 100,
    network: 'MATIC',
    chainId: 80002,
    source: 'native',
    manaWei: null
  }
}

function outfit(i: number) {
  return {
    id: `aaaaaaaa-0000-4000-8000-00000000000${i}`,
    name: `Look ${i}`,
    thumbnailHash: THUMB,
    items: [
      { contractAddress: COLLECTION, itemId: '0' },
      { contractAddress: COLLECTION, itemId: '1' }
    ],
    bodyShape: 'unisex',
    gradientFrom: '#a855f7',
    gradientTo: '#e0219a',
    authorAddress: CREATOR_ADDRESS,
    published: true,
    createdAt: 1750000000000,
    updatedAt: 1750000000000
  }
}

const fixtures = {
  unifiedListings: { data: Array.from({ length: 30 }, (_, i) => listing(i)), total: 30 },
  outfits: { outfits: [1, 2, 3, 4, 5, 6].map(outfit) },
  rankings: {
    data: [1, 2, 3, 4].map(i => ({
      id: '0x' + String(i).repeat(40),
      sales: 10 - i,
      earned: '1000000000000000000',
      collections: 3,
      uniqueCollectors: 2
    }))
  }
}

type Layout = {
  cls: number
  shifts: number
  first: number | null
  last: number | null
  max: number
  /** One entry per shifted node, so a CLS failure names what moved instead of only how much. */
  sources?: { value: number; tag: string; testid: string | null; text: string | null }[]
}
type Headings = { trending: number; newCreations: number; buyTheLook: number; topCreators: number; docHeight: number }

// Load the page at `width` with the feeds staggered, with the recorder running from the first frame.
async function loadStaggered(width: number, height: number): Promise<Page> {
  app = await launchApp({
    path: '/overview',
    base: BASE,
    fixtures,
    initScript: RECORDER,
    delays: DELAYS,
    waitUntil: 'domcontentloaded'
  })
  const { page } = app
  // The viewport has to be in effect for the FIRST paint, and launchApp navigates on its desktop default —
  // so reload at the target width. The recorder is an on-new-document script; it runs again on the reload.
  await page.setViewport({ width, height })
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
  return page
}

async function waitForSettled(page: Page) {
  await page.waitForFunction(
    (perRail: number) =>
      document.querySelectorAll('[data-testid="card"]').length >= perRail * 2 &&
      document.querySelectorAll('[data-testid="outfit-card"]').length > 0 &&
      document.querySelectorAll('[data-testid="top-creator-card"]').length > 0 &&
      document.querySelectorAll('[data-testid="skeleton-card"]').length === 0,
    { timeout: 30000 },
    PER_RAIL
  )
  // Past the crossfade, so nothing is still animating when the settled numbers are read.
  await new Promise(r => setTimeout(r, 400))
}

describe.each([
  { label: 'desktop', width: 1280, height: 900 },
  { label: '375px', width: 375, height: 812 }
])('the overview holds its layout while it loads ($label)', ({ width, height }) => {
  it('keeps the last section heading at the same y from first paint to settled', async () => {
    const page = await loadStaggered(width, height)

    // First paint: every section is a placeholder, and the landmark already has its final position.
    await page.waitForSelector('[data-testid="skeleton-card"]', { timeout: 20000 })
    const loading = (await page.evaluate(HEADINGS)) as Headings
    const skeletons = await page.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid="skeleton-card"]').length,
      outfits: document.querySelectorAll('[data-testid="skeleton-outfit-card"]').length,
      creators: document.querySelectorAll('[data-testid="top-creator-skeleton"]').length
    }))

    await waitForSettled(page)
    const settled = (await page.evaluate(HEADINGS)) as Headings
    const layout = await page.evaluate(() => (window as unknown as { __layout: Layout }).__layout)

    // eslint-disable-next-line no-console
    console.log(
      `[overview-layout @${width}] landmark first=${layout.first} last=${layout.last} max=${layout.max} ` +
        `cls=${layout.cls.toFixed(5)} shifts=${layout.shifts}\n` +
        `  loading  ${JSON.stringify(loading)}\n  settled  ${JSON.stringify(settled)}`
    )

    // Every section reserved a rail of placeholders, one per card it was about to show.
    expect(skeletons).toEqual({ cards: PER_RAIL * 2, outfits: OUTFIT_SKELETONS, creators: CREATOR_SKELETONS })

    // Every section heading — the loading page's shape is the settled page's shape.
    // Non-null first: `at()` returns null for a heading that does not exist, and null === null would let
    // this pass for a rail that had been renamed out from under it.
    expect(settled.trending).not.toBeNull()
    expect(settled.newCreations).not.toBeNull()
    expect(loading.trending).toBe(settled.trending)
    expect(loading.newCreations).toBe(settled.newCreations)
    expect(loading.buyTheLook).toBe(settled.buyTheLook)
    expect(loading.topCreators).toBe(settled.topCreators)

    // The landmark, sampled every frame from the first one it existed in: it never moved, so nothing a
    // reader was about to click moved either. 1px of tolerance for sub-pixel rounding only.
    expect(layout.first).not.toBeNull()
    expect(Math.abs((layout.last ?? 0) - (layout.first ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs(layout.max - (layout.first ?? 0))).toBeLessThanOrEqual(1)

    // And the page ends where it ended: the footer sits at the same place under a loading page.
    expect(Math.abs(loading.docHeight - settled.docHeight)).toBeLessThanOrEqual(2)
  })

  it('accumulates no meaningful layout shift as the feeds land', async () => {
    const page = await loadStaggered(width, height)
    await page.waitForSelector('[data-testid="skeleton-card"]', { timeout: 20000 })

    /**
     * Scroll down onto the rails before the feeds land.
     *
     * CLS only counts what MOVES INSIDE THE VIEWPORT, so a page whose lower half slides 1000px scores
     * almost nothing while the reader is still at the top — measured: against origin/main this scored
     * 0.003 at 375px with the last heading jumping 872 -> 1939, i.e. the metric graded the bug as fine.
     * A reader who has scrolled to the rails is the one the shift actually happens to, so that is where
     * this measures. Programmatic, so it is not "recent input" and the shifts stay attributed.
     */
    await page.evaluate(() => window.scrollTo(0, 400))
    await waitForSettled(page)
    const layout = await page.evaluate(() => (window as unknown as { __layout: Layout }).__layout)

    // eslint-disable-next-line no-console
    console.log(
      `[overview-layout @${width}] CLS=${layout.cls.toFixed(5)} over ${layout.shifts} shift entries ` +
        JSON.stringify(layout.sources)
    )

    // Chrome calls anything under 0.1 "good"; this page measures at essentially zero (what is left is the
    // navbar's credit balance resolving, which belongs to the shell), and the budget is set an order of
    // magnitude under the "good" bar so a section returning to a no-height loading state fails here
    // rather than being graded as acceptable.
    expect(layout.cls).toBeLessThan(0.01)
  })

  it('fills the visible width of every loading rail, so no rail shows a gap at first paint', async () => {
    const page = await loadStaggered(width, height)
    await page.waitForSelector('[data-testid="skeleton-card"]', { timeout: 20000 })

    // One entry per rail that is showing placeholders: how much width they cover (their own plus the
    // 16px rail gap) against how much of the rail is on screen.
    const rails = await page.evaluate(() => {
      const placeholders = [
        ...document.querySelectorAll('[data-testid="skeleton-card"], [data-testid="skeleton-outfit-card"]')
      ]
      const tracks = [...new Set(placeholders.map(el => el.parentElement as HTMLElement))]
      return tracks.map(track => {
        const cards = [...track.children] as HTMLElement[]
        const style = getComputedStyle(track)
        // The rail reserves side padding for the cards' outward hover glow, so what has to be covered is
        // the track's CONTENT box, not its clientWidth.
        const view = track.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const covered = cards.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + 16 * (cards.length - 1)
        return { covered: Math.round(covered), view: Math.round(view), count: cards.length }
      })
    })

    // eslint-disable-next-line no-console
    console.log(`[overview-layout @${width}] loading rails ${JSON.stringify(rails)}`)

    // The two carousels and the outfits row.
    expect(rails).toHaveLength(3)
    for (const rail of rails) expect(rail.covered).toBeGreaterThanOrEqual(rail.view)
  })
})

describe('how the skeletons leave', () => {
  it('crossfades out over the cards that replaced them, out of flow and click-through', async () => {
    const page = await loadStaggered(1280, 900)
    await page.waitForSelector('[data-testid="skeleton-card"]', { timeout: 20000 })

    // The fading copy lives for the length of the fade only, so it is caught rather than waited for.
    await page.waitForSelector('[data-testid="skeleton-settle"]', { timeout: 20000 })
    const layer = await page.$eval('[data-testid="skeleton-settle"]', el => {
      const style = getComputedStyle(el)
      return {
        position: style.position,
        pointerEvents: style.pointerEvents,
        opacity: Number(style.opacity),
        // The real cards are underneath it, already laid out, while it fades.
        cardsUnderneath: document.querySelectorAll('[data-testid="card"]').length,
        // Its own copies are testid'd apart from the loading ones, so counting either stays honest.
        copies: el.querySelectorAll('[data-testid="skeleton-card-settling"]').length
      }
    })

    expect(layer.position).toBe('absolute')
    expect(layer.pointerEvents).toBe('none')
    expect(layer.opacity).toBeGreaterThan(0)
    expect(layer.opacity).toBeLessThanOrEqual(1)
    expect(layer.cardsUnderneath).toBeGreaterThan(0)
    expect(layer.copies).toBe(PER_RAIL)

    // And it cleans itself up rather than sitting on the page.
    await page.waitForFunction(() => !document.querySelector('[data-testid="skeleton-settle"]'), { timeout: 5000 })
  })

  it('skips the fade entirely for a visitor who asked for less motion, and still reserves the space', async () => {
    app = await launchApp({
      path: '/overview',
      base: BASE,
      fixtures,
      initScript: RECORDER,
      delays: DELAYS,
      waitUntil: 'domcontentloaded'
    })
    const { page } = app
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })

    await page.waitForSelector('[data-testid="skeleton-card"]', { timeout: 20000 })
    // Reserved, not animated: the placeholders hold their box with the shimmer switched off.
    const shimmer = await page.$eval('[data-testid="skeleton-card"]', el => ({
      animation: getComputedStyle(el).animationName,
      height: Math.round(el.getBoundingClientRect().height)
    }))
    expect(shimmer.animation).toBe('none')
    expect(shimmer.height).toBe(300)

    const before = (await page.evaluate(HEADINGS)) as Headings
    await waitForSettled(page)
    const after = (await page.evaluate(HEADINGS)) as Headings
    const layout = await page.evaluate(() => (window as unknown as { __layout: Layout }).__layout)

    // eslint-disable-next-line no-console
    console.log(`[overview-layout reduced-motion] landmark ${layout.first} -> ${layout.last}`)

    // The whole point of the reservation survives the animation being off.
    expect(after.topCreators).toBe(before.topCreators)
    expect(Math.abs((layout.last ?? 0) - (layout.first ?? 0))).toBeLessThanOrEqual(1)
  })
})
