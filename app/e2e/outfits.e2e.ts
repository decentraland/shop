import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hermeticViteEnv, launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

/**
 * Outfits: the Overview row, the /outfits/:id detail page and the creator studio.
 *
 * The feature is dark whenever no shop-server host is configured — which is exactly what the shared
 * e2e server ships (SHOP_SERVER_URL is '' in every committed env). So this spec boots its OWN vite
 * server with VITE_SHOP_SERVER_URL pointing at the mocked shop-server (:5004, helpers/app.ts) and
 * runs every page against it. Specs run sequentially (fileParallelism: false), so the extra port
 * never clashes.
 */

const PORT = Number(process.env.E2E_OUTFITS_PORT ?? 5283)
const OUTFITS_BASE = `http://localhost:${PORT}`
let server: ChildProcess | undefined

// Mobile-layout screenshots land here for human review; the assertions don't depend on them.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(tmpdir(), 'shop-outfits-e2e')

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  const vite = resolve(process.cwd(), 'node_modules/.bin/vite')
  server = spawn(vite, ['--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    // Same hermetic env as global-setup, PLUS the mocked shop-server the outfits feature needs.
    env: hermeticViteEnv({ VITE_SHOP_SERVER_URL: 'http://localhost:5004' })
  })
  const deadline = Date.now() + 90000
  for (;;) {
    try {
      const res = await fetch(`${OUTFITS_BASE}/`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`outfits e2e server did not start on ${OUTFITS_BASE}`)
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

// Three published outfits over the fixture catalog: two fully purchasable (the row shows ONLY
// fully-available outfits, and two of them keep it paginating on phones), one with a delisted pair
// (itemId 99 resolves to nothing) — dropped from the row, still reachable at /outfits/:id where the
// partial states render.
const FULL_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const PARTIAL_ID = 'aaaaaaaa-0000-4000-8000-000000000002'
const FULL_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000003'
const THUMB_HASH = 'e2e' + '0'.repeat(61)
// The creator-chosen backdrop the transparent thumbnail is composited over.
const GRADIENT_FROM = '#a855f7'
const GRADIENT_TO = '#e0219a'
// Chrome drops the explicit `180deg` when computing the style — top-to-bottom is the CSS default.
const GRADIENT_CSS = 'linear-gradient(rgb(168, 85, 247) 0%, rgb(224, 33, 154) 100%)'
// The detail preview is the same two stops as a radial glow — BOTTOM color at the centre.
const RADIAL_CSS = 'radial-gradient(circle, rgb(224, 33, 154) 0%, rgb(168, 85, 247) 100%)'

function outfitFixtures() {
  return {
    outfits: {
      outfits: [
        {
          id: FULL_ID,
          name: 'Galaxy Look',
          thumbnailHash: THUMB_HASH,
          items: [
            { contractAddress: COLLECTION, itemId: '0' },
            { contractAddress: COLLECTION, itemId: '1' }
          ],
          bodyShape: 'unisex',
          gradientFrom: GRADIENT_FROM,
          gradientTo: GRADIENT_TO,
          authorAddress: CREATOR_ADDRESS,
          published: true,
          createdAt: 1750000000000,
          updatedAt: 1750000000000
        },
        {
          id: PARTIAL_ID,
          name: 'Nebula Look',
          thumbnailHash: THUMB_HASH,
          items: [
            { contractAddress: COLLECTION, itemId: '0' },
            { contractAddress: COLLECTION, itemId: '99' }
          ],
          bodyShape: 'female',
          gradientFrom: GRADIENT_FROM,
          gradientTo: GRADIENT_TO,
          authorAddress: CREATOR_ADDRESS,
          published: true,
          createdAt: 1749000000000,
          updatedAt: 1749000000000
        },
        {
          id: FULL_ID_2,
          name: 'Cosmic Look',
          thumbnailHash: THUMB_HASH,
          items: [
            { contractAddress: COLLECTION, itemId: '0' },
            { contractAddress: COLLECTION, itemId: '1' }
          ],
          bodyShape: 'male',
          gradientFrom: GRADIENT_FROM,
          gradientTo: GRADIENT_TO,
          authorAddress: CREATOR_ADDRESS,
          published: true,
          createdAt: 1748000000000,
          updatedAt: 1748000000000
        }
      ]
    }
  }
}

async function launch(path: string, opts: Partial<Parameters<typeof launchApp>[0]> = {}) {
  app = await launchApp({ path, base: OUTFITS_BASE, fixtures: outfitFixtures(), ...opts })
  return app.page
}

describe('outfits row on the overview', () => {
  it('renders the published outfits with live totals and adds every purchasable item to the cart', async () => {
    const page = await launch('/overview')
    await page.waitForSelector('[data-testid="outfits-row"]', { timeout: 20000 })
    await waitForText(page, 'Galaxy Look')

    // The full outfit resolves both pairs → 270 + 135 credits.
    await page.waitForFunction(
      () => {
        const card = [...document.querySelectorAll('[data-testid="outfit-card"]')].find(c =>
          (c.textContent ?? '').includes('Galaxy Look')
        )
        return !!card && card.getAttribute('data-availability') === 'full' && (card.textContent ?? '').includes('405')
      },
      { timeout: 20000 }
    )
    // The row only shows fully-available outfits: the one with a delisted pair is dropped (it stays
    // reachable at /outfits/:id), and every CTA on the row reads plain "Add to cart".
    const names = await page.$$eval('[data-testid="outfit-card"]', cards => cards.map(c => c.textContent ?? ''))
    expect(names.some(text => text.includes('Nebula Look'))).toBe(false)
    expect(names.some(text => text.includes('Cosmic Look'))).toBe(true)
    const ctas = await page.$$eval('[data-testid="outfit-card-cta"]', els => els.map(el => el.textContent?.trim()))
    expect(ctas.every(label => label === 'Add to cart')).toBe(true)

    // The CTA adds without navigating; the cart badge proves both items landed.
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('[data-testid="outfit-card"]')].find(c =>
        (c.textContent ?? '').includes('Galaxy Look')
      )
      ;(card?.querySelector('[data-testid="outfit-card-cta"]') as HTMLElement).click()
    })
    await waitForText(page, 'Outfit added to cart')
    await page.waitForFunction(() => document.querySelector('[data-testid="subnav-cart-badge"]')?.textContent === '2', {
      timeout: 10000
    })
    expect(page.url()).toContain('/overview')
  })

  // Thumbnails are uploaded transparent, so the creator's two colors ARE the card's backdrop.
  it("paints each card with its creator's gradient behind the thumbnail", async () => {
    const page = await launch('/overview')
    await page.waitForSelector('[data-testid="outfit-card"]', { timeout: 20000 })
    const background = await page.$eval('[data-testid="outfit-card-thumb"]', el => getComputedStyle(el).backgroundImage)
    expect(background).toBe(GRADIENT_CSS)
  })

  // The Figma treatment: the resting card is pure artwork; name, count, total and CTA appear over
  // the dark scrim on hover or keyboard focus, together with the accent stroke on the frame. The
  // reveal is driven here by FOCUS, which shares the hover rules: legacy-headless pointer hover
  // proved flaky under host load, while element.focus() is deterministic.
  it('keeps the resting card clean and reveals the info panel on focus/hover', async () => {
    const page = await launch('/overview')
    await page.waitForSelector('[data-testid="outfit-card"]', { timeout: 20000 })
    await waitForText(page, 'Galaxy Look')

    // The card has TWO specified resting states and the RUNNER picks which one is in force: a
    // pointer device gets the clean card that reveals on hover/focus, a hover-less one gets the
    // panel permanently (OutfitCard.styles.ts, `@media (hover: none)` — touch has no hover to
    // reveal on). A headless CI container reports the latter; a dev machine reports the former.
    // Chrome exposes no way to pin it either: page.emulateMediaFeatures rejects the `hover` name
    // outright, and a raw CDP Emulation.setEmulatedMedia does not move it, because it follows the
    // real input configuration.
    //
    // So ask which treatment applies and assert THAT one, rather than hard-coding the one the
    // author's machine happens to report. The reveal itself is driven by FOCUS, which shares the
    // hover rules: pointer hover proved flaky under host load, element.focus() is deterministic.
    const pointer = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    const infoOpacity = () => page.$eval('[data-testid="outfit-card-info"]', el => getComputedStyle(el).opacity)
    // Settles (not one-shot): a transient mid-mount read is not the regression this guards against —
    // a rest-visible panel would never reach 0.
    const settleTo = (value: string) =>
      page.waitForFunction(
        (expected: string) => {
          const info = document.querySelector('[data-testid="outfit-card-info"]')
          return !!info && getComputedStyle(info).opacity === expected
        },
        { timeout: 20000 },
        value
      )

    if (pointer) await settleTo('0')
    else expect(await infoOpacity()).toBe('1')

    // The CTA stays DISABLED until the catalog resolution settles, and a disabled button cannot take
    // focus — `page.focus()` on one is a silent no-op. On a dev machine the catalog is back before
    // the test gets here, so focus lands; on a slow runner it is not, and the assertions below were
    // then reading a card nothing had focused. Wait for the button to be live, and prove the focus
    // actually took, so a future failure here means the STYLES broke rather than the timing.
    await page.waitForFunction(
      () => {
        const cta = document.querySelector<HTMLButtonElement>('[data-testid="outfit-card-cta"]')
        return !!cta && !cta.disabled
      },
      { timeout: 20000 }
    )
    await page.focus('[data-testid="outfit-card-cta"]')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'outfit-card-cta', {
      timeout: 10000
    })

    await settleTo('1')

    // The accent stroke has its own `transition: outline-color 0.2s`, so it must be waited on rather
    // than sampled. Reading it once only worked where the opacity wait above happened to cover the
    // same 200ms: on a hover-less runner the panel is ALREADY at opacity 1, so that wait returns
    // immediately and this read landed at the very start of the stroke's fade — transparent.
    await page.waitForFunction(
      () => {
        const frame = document.querySelector('[data-testid="outfit-card-thumb"]')
        return !!frame && getComputedStyle(frame).outlineColor === 'rgb(122, 43, 191)'
      },
      { timeout: 10000 }
    )

    // Blurring returns a pointer card to rest — the reveal is not sticky. A hover-less card keeps
    // its panel, which is the point of that branch.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    if (pointer) await settleTo('0')
    else expect(await infoOpacity()).toBe('1')
  })

  // The side arrows exist only when the rail actually pages, and the three-outfit fixture fits one
  // desktop view — so this seeds enough looks for a second page.
  it('pages the rail with the side arrows when the looks overflow one view', async () => {
    const [full] = outfitFixtures().outfits.outfits
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...full,
      id: `aaaaaaaa-0000-4000-8000-00000000001${i}`,
      name: `Look ${i + 1}`
    }))
    const page = await launch('/overview', { fixtures: { outfits: { outfits: many } } })
    await page.waitForSelector('[data-testid="outfits-row-next"]', { timeout: 20000 })

    // Hidden (disabled) at the first page, live at the last.
    expect(await page.$eval('[data-testid="outfits-row-prev"]', el => (el as HTMLButtonElement).disabled)).toBe(true)

    // The scroll is smooth, so settle on the arrows swapping state — the last page is only a sliver
    // of a viewport wide, which is exactly the case a scrollLeft/width page index gets wrong.
    await page.click('[data-testid="outfits-row-next"]')
    await page.waitForFunction(
      () => {
        const prev = document.querySelector('[data-testid="outfits-row-prev"]') as HTMLButtonElement | null
        const next = document.querySelector('[data-testid="outfits-row-next"]') as HTMLButtonElement | null
        return !!prev && !!next && !prev.disabled && next.disabled
      },
      { timeout: 20000 }
    )
    expect(await page.$eval('[data-testid="outfits-row-track"]', el => el.scrollLeft > 0)).toBe(true)
  })

  it('renders nothing at all when there are no published outfits', async () => {
    const page = await launch('/overview', { fixtures: { outfits: { outfits: [] } } })
    await waitForText(page, 'Featured Products')
    expect(await page.$('[data-testid="outfits-row"]')).toBeNull()
  })
})

describe('outfit detail page', () => {
  it('shows the per-item states, an honest count and a CTA that reflects what it can add', async () => {
    const page = await launch(`/items/outfits/${PARTIAL_ID}`)
    await page.waitForSelector('[data-testid="outfit-detail"]', { timeout: 20000 })
    await waitForText(page, 'Nebula Look')

    // Two rows: the live pair and the delisted one (grayed, "no longer available" — a MISSING pair,
    // never conflated with an outage).
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="outfit-detail-item"]').length === 2, {
      timeout: 20000
    })
    await page.waitForFunction(
      () =>
        !!document.querySelector('[data-testid="outfit-detail-item"][data-state="missing"]') &&
        !!document.querySelector('[data-testid="outfit-detail-item"][data-state="purchasable"]'),
      { timeout: 20000 }
    )
    // The count label is item-count only now; partiality is carried by the per-item states + CTA.
    await waitForText(page, '2 items in this outfit')

    // Add the one purchasable item, then the CTA disables with a translated reason.
    await page.waitForFunction(
      () => {
        const cta = document.querySelector('[data-testid="outfit-detail-cta"]') as HTMLButtonElement | null
        return !!cta && !cta.disabled && /add 1 item/i.test(cta.textContent ?? '')
      },
      { timeout: 20000 }
    )
    await page.click('[data-testid="outfit-detail-cta"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="subnav-cart-badge"]')?.textContent === '1', {
      timeout: 10000
    })
    await page.waitForFunction(
      () => {
        const cta = document.querySelector('[data-testid="outfit-detail-cta"]') as HTMLButtonElement | null
        return !!cta && cta.disabled
      },
      { timeout: 10000 }
    )
  })

  it("backs the avatar preview with the creator's colors as a radial glow", async () => {
    const page = await launch(`/items/outfits/${FULL_ID}`)
    await page.waitForSelector('[data-testid="outfit-detail-preview"]', { timeout: 20000 })
    const background = await page.$eval(
      '[data-testid="outfit-detail-preview"]',
      el => getComputedStyle(el).backgroundImage
    )
    expect(background).toBe(RADIAL_CSS)
  })

  it('shows the translated not-found state for an unknown id', async () => {
    const page = await launch('/items/outfits/no-such-outfit')
    await page.waitForSelector('[data-testid="outfit-notfound"]', { timeout: 20000 })
    await waitForText(page, "This outfit isn't available")
  })
})

describe('outfit studio', () => {
  it('hides behind a friendly state for signed-in non-creators', async () => {
    const page = await launch('/outfits/manage')
    await page.waitForSelector('[data-testid="outfit-studio-unavailable"]', { timeout: 20000 })
  })

  it('lists every outfit for a creator and saves a new draft', async () => {
    const page = await launch('/outfits/manage', { outfitCreator: true })
    await page.waitForSelector('[data-testid="outfit-studio-list"]', { timeout: 20000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="outfit-studio-row"]').length === 3, {
      timeout: 20000
    })

    // New draft: a name alone is saveable; publish stays disabled until name+thumbnail+an item.
    await page.click('[data-testid="outfit-studio-new"]')
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })
    await page.type('[data-testid="outfit-studio-name"]', 'Fresh Look')
    const publishDisabled = await page.$eval(
      '[data-testid="outfit-studio-publish"]',
      el => (el as HTMLButtonElement).disabled
    )
    expect(publishDisabled).toBe(true)
    await page.click('[data-testid="outfit-studio-save"]')
    await waitForText(page, 'Outfit saved')

    // The list now includes the draft, marked as one.
    await page.goto(`${OUTFITS_BASE}/outfits/manage`, { waitUntil: 'networkidle2' })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="outfit-studio-row"]').length === 4, {
      timeout: 20000
    })
    await waitForText(page, 'Fresh Look')
    await waitForText(page, 'Draft')
  })

  // The colors are seeded with the brand gradient, so the picker is usable immediately and the
  // chosen pair previews live behind the mannequin.
  it('offers both gradient stops and previews the chosen pair live', async () => {
    const page = await launch('/outfits/new', { outfitCreator: true })
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })

    const seeded = await page.$eval('[data-testid="outfit-studio-gradient-from"]', el => (el as HTMLInputElement).value)
    expect(seeded).toMatch(/^#[0-9a-f]{6}$/)

    // Driving <input type="color"> through the OS dialog isn't possible headlessly. Setting .value
    // directly needs React's value tracker bypassed, or its synthetic onChange dedupes the event as
    // a no-op and the draft never updates.
    await page.$eval('[data-testid="outfit-studio-gradient-from"]', el => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '#00ff00')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector('[data-testid="outfit-studio-preview"]') as Element
        ).backgroundImage.includes('rgb(0, 255, 0)'),
      { timeout: 10000 }
    )
  })

  // The autosaved draft is a guard against accidental loss (refresh, account-switch reload),
  // not a persistent form: deliberately navigating away discards it.
  it('restores the draft across a refresh but resets it after navigating away', async () => {
    const page = await launch('/outfits/new', { outfitCreator: true })
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })
    await page.type('[data-testid="outfit-studio-name"]', 'Half Finished')

    // The dirty draft arms the tab-close beforeunload guard; accept its dialog so reload proceeds.
    page.on('dialog', dialog => void dialog.accept())
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })
    const afterReload = await page.$eval('[data-testid="outfit-studio-name"]', el => (el as HTMLInputElement).value)
    expect(afterReload).toBe('Half Finished')

    // In-app links, not page.goto: a goto is a full page load, which the guard must survive.
    await page.click('[data-testid="outfit-studio-back"]')
    await page.waitForSelector('[data-testid="outfit-studio-list"]', { timeout: 20000 })
    await page.click('[data-testid="outfit-studio-new"]')
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })
    const afterReturn = await page.$eval('[data-testid="outfit-studio-name"]', el => (el as HTMLInputElement).value)
    expect(afterReturn).toBe('')
  })

  it('deletes an outfit behind the confirm dialog, with unpublish offered first', async () => {
    const page = await launch('/outfits/manage', { outfitCreator: true })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="outfit-studio-row"]').length === 3, {
      timeout: 20000
    })
    await page.evaluate(() => {
      ;(document.querySelector('[data-testid="outfit-studio-delete"]') as HTMLElement).click()
    })
    await page.waitForSelector('[data-testid="outfit-studio-confirm"]', { timeout: 10000 })
    // Both paths offered for a published outfit; delete is the one this test takes.
    expect(await page.$('[data-testid="outfit-studio-confirm-unpublish"]')).not.toBeNull()
    await page.click('[data-testid="outfit-studio-confirm-delete"]')
    await waitForText(page, 'Outfit deleted')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="outfit-studio-row"]').length === 2, {
      timeout: 20000
    })
  })
})

describe('outfits at phone width (≤768px)', () => {
  const PHONE = { width: 390, height: 844 }

  function overflowPx(page: App['page']) {
    return page.evaluate(() => {
      const d = document.documentElement
      return Math.max(0, Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth)
    })
  }

  it('the overview row lays out without sideways scroll', async () => {
    const page = await launch('/overview')
    // Touch emulation matters here: it flips the hover media feature, which is what the card keys
    // the info panel on — a phone has no hover, so the panel must be there without one.
    await page.setViewport({ ...PHONE, isMobile: true, hasTouch: true })
    await page.waitForSelector('[data-testid="outfits-row"]', { timeout: 20000 })
    await waitForText(page, 'Galaxy Look')
    const info = await page.$eval('[data-testid="outfit-card-info"]', el => getComputedStyle(el).opacity)
    expect(info).toBe('1')
    // One full-width card per page at this width, so the two outfits paginate: dots appear.
    await page.waitForSelector('[data-testid="outfits-row-dots"]', { timeout: 10000 })
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
    await page.evaluate(() => document.querySelector('[data-testid="outfits-row"]')?.scrollIntoView())
    await page.screenshot({ path: `${SHOTS}/outfits-row-mobile.png` })
  })

  it('the detail page stacks and pins the CTA bar to the bottom', async () => {
    const page = await launch(`/items/outfits/${FULL_ID}`)
    await page.setViewport(PHONE)
    await page.waitForSelector('[data-testid="outfit-detail"]', { timeout: 20000 })
    await waitForText(page, 'Galaxy Look')
    await page.waitForFunction(
      () => {
        const cta = document.querySelector('[data-testid="outfit-detail-cta"]') as HTMLButtonElement | null
        return !!cta && !cta.disabled
      },
      { timeout: 20000 }
    )
    // The CTA bar is STICKY at this width: it rides the viewport bottom while the list runs past
    // the fold, then parks at the list's end when the user scrolls on toward the footer.
    const bar = await page.$eval('[data-testid="outfit-detail-ctabar"]', el => {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return { position: style.position, stuck: Math.abs(rect.bottom - window.innerHeight) < 2 }
    })
    expect(bar.position).toBe('sticky')
    expect(bar.stuck).toBe(true)
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${SHOTS}/outfits-detail-mobile.png`, fullPage: true })
  })

  it('the studio editor stacks preview above the picker and stays usable', async () => {
    const page = await launch('/outfits/new', { outfitCreator: true })
    await page.setViewport(PHONE)
    await page.waitForSelector('[data-testid="outfit-studio-editor"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="outfit-picker"]', { timeout: 20000 })
    expect(await overflowPx(page)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${SHOTS}/outfits-studio-mobile.png`, fullPage: true })
  })
})
