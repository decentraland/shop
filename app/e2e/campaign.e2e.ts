import { mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import * as fx from './fixtures'

/**
 * The seasonal campaign taking over the home hero.
 *
 * The hero is the Shop's own artwork, headline and credits CTA compiled into the bundle. A running
 * campaign replaces all four from the CMS, into the SAME markup — so what has to hold is that they move
 * together, and that the Shop's own comes back the moment there is no campaign. That second half is what
 * lets marketing end an event by unpublishing an entry, with no deploy.
 *
 * Needs a real browser rather than the unit specs' jsdom for two reasons neither of those can reach: the
 * client asks the CMS for each entry once per locale and merges the answers, and the artwork URL it
 * receives points at a host the deployed CSP forbids — so the rewrite onto the Decentraland image proxy
 * has to survive all the way to the `src` a browser actually requests.
 */

// Screenshots go to the OS temp dir, never into the repo — same as the outfits spec.
const SHOTS = process.env.E2E_SHOTS_DIR ?? join(tmpdir(), 'shop-campaign-e2e')

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const heroImage = (app: App) =>
  app.page.$eval('picture img', el => ({
    src: el.getAttribute('src') ?? '',
    complete: (el as HTMLImageElement).complete
  }))

describe('the home hero', () => {
  it('shows the shop’s own hero while no campaign is running', async () => {
    app = await launchApp({ path: '/overview' })

    await waitForText(app.page, 'A New Way to Shop')
    expect(await app.page.$('[data-testid="hero-credits-cta"]')).not.toBeNull()
    expect(await app.page.$('[data-testid="hero-campaign-cta"]')).toBeNull()
  })

  it('hands the whole hero to a running campaign', async () => {
    app = await launchApp({ path: '/overview', campaign: true })

    // Headline, CTA label and CTA destination all come from the CMS entry...
    await waitForText(app.page, 'Halloween is here')
    const cta = await app.page.$('[data-testid="hero-campaign-cta"]')
    expect(cta).not.toBeNull()
    expect(await cta!.evaluate(el => el.getAttribute('href'))).toBe('https://decentraland.org/shop/event')
    // ...and the Shop's own CTA is gone rather than sitting alongside it.
    expect(await app.page.$('[data-testid="hero-credits-cta"]')).toBeNull()
  })

  it('loads the campaign artwork through the image proxy the CSP allows', async () => {
    app = await launchApp({ path: '/overview', campaign: true })
    await waitForText(app.page, 'Halloween is here')

    const { src, complete } = await heroImage(app)

    // The CMS hands out `//images.ctfassets.net/...`, which no Decentraland CSP permits — an un-rewritten
    // URL is a blocked request and a hero with no artwork.
    expect(src).toContain('cms-images.decentraland.org')
    expect(src).not.toContain('ctfassets.net')
    // And it actually decoded, rather than merely being pointed at.
    expect(complete).toBe(true)
  })

  it('keeps the campaign hero on a phone', async () => {
    app = await launchApp({ path: '/overview', campaign: true })
    await app.page.setViewport({ width: 390, height: 844 })
    await waitForText(app.page, 'Halloween is here')

    // The phone frame is a different composition, so the campaign's own mobile artwork is what the
    // `<picture>` offers at this width.
    const srcset = await app.page.$eval('picture source', el => el.getAttribute('srcset') ?? '')
    expect(srcset).toContain('cms-images.decentraland.org')
    expect(await app.page.$('[data-testid="hero-campaign-cta"]')).not.toBeNull()
    await mkdir(SHOTS, { recursive: true })
    await app.page.screenshot({ path: join(SHOTS, 'campaign-hero-mobile.png') })
  })
})

/**
 * The event tab, and the grid behind it.
 *
 * The tab is the campaign's own name, so it is asserted literally — it never goes through the app's
 * translations. What the browser proves that jsdom cannot is the round trip: the tag reaches the builder,
 * the collections it answers with reach the catalogue request, and the grid that comes back is the one the
 * tab opened.
 */
describe('the event tab', () => {
  it('is absent while no campaign is running', async () => {
    app = await launchApp({ path: '/overview' })

    expect(await app.page.$('[data-testid="nav-event"]')).toBeNull()
  })

  it('carries the campaign name and opens the event grid', async () => {
    app = await launchApp({ path: '/overview', campaign: true })

    const tab = await app.page.waitForSelector('[data-testid="nav-event"]')
    expect(await tab!.evaluate(el => el.textContent)).toBe('Halloween')

    await Promise.all([tab!.click(), app.page.waitForNavigation({ waitUntil: 'networkidle2' })])

    expect(new URL(app.page.url()).pathname).toMatch(/\/event$/)
    await app.page.waitForSelector('[data-testid="browse"]')
  })

  it('asks the catalogue for the campaign’s collections only', async () => {
    const asked: string[] = []
    app = await launchApp({ path: '/event', campaign: true })
    app.page.on('request', r => {
      if (r.url().includes('/v3/catalog/unified')) asked.push(r.url())
    })
    await app.page.reload({ waitUntil: 'networkidle2' })

    expect(asked.length).toBeGreaterThan(0)
    // The set travels comma-separated, which is the encoding this endpoint parses, and carries BOTH
    // sources: the collection the builder returned for the tag, and the one the CMS named outright.
    const filters = asked.map(url => decodeURIComponent(new URL(url).searchParams.get('contractAddress') ?? ''))
    expect(filters.some(f => f.includes(fx.COLLECTION))).toBe(true)
    expect(filters.some(f => f.includes('0xdef0000000000000000000000000000000000002'))).toBe(true)
  })
})

/**
 * The chip that marks an item as part of the running event.
 *
 * In a browser because the round trip is the point: the item's collection has to match the set the builder
 * answered with, and the chip has to link back into the tab that set came from.
 */
describe('the event chip on an item', () => {
  const itemPath = `/item/${fx.COLLECTION}/0`

  it('is absent while no campaign is running', async () => {
    app = await launchApp({ path: itemPath })
    await waitForText(app.page, 'Galaxy Hat')

    expect(await app.page.$('[data-testid="detail-event"]')).toBeNull()
  })

  it('names the event and opens its grid', async () => {
    app = await launchApp({ path: itemPath, campaign: true })
    await waitForText(app.page, 'Galaxy Hat')

    const chip = await app.page.waitForSelector('[data-testid="detail-event"]')
    expect(await chip!.evaluate(el => el.textContent)).toContain('Halloween')

    await Promise.all([chip!.click(), app.page.waitForNavigation({ waitUntil: 'networkidle2' })])
    expect(new URL(app.page.url()).pathname).toMatch(/\/event$/)
  })
})
