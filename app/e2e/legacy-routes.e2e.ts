import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'

/**
 * The browse routes renamed by the Assets → Items copy change keep their OLD urls working.
 *
 * /assets is published in public/sitemap.xml (so it is indexed), and creator storefronts
 * (/assets/creator/:address) and outfit pages (/assets/outfits/:id) get shared as links. The rename moved
 * every one of them, which makes these redirects the only thing between a stale link and a 404 — and the
 * kind of breakage nothing else would catch, because the app itself now only ever emits the new paths.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const CREATOR = '0x0000000000000000000000000000000000000abc'

// [old url, expected pathname, expected search].
const REDIRECTS: ReadonlyArray<readonly [string, string, string]> = [
  ['/assets', '/items', ''],
  // The query has to survive the hop: a shared search result IS a /assets?q= link, and a plain
  // <Navigate to="/items"> would drop it and land the visitor on the unfiltered grid instead.
  ['/assets?q=Nebula', '/items', '?q=Nebula'],
  [`/assets/creator/${CREATOR}`, `/items/creator/${CREATOR}`, ''],
  ['/assets/outfits/outfit-1', '/items/outfits/outfit-1', ''],
  ['/my-assets', '/my-items', '']
]

describe('the renamed browse routes', () => {
  it('redirects every old /assets path to its /items equivalent, sub-path and query intact', async () => {
    // One browser for the lot, but each entry is a fresh TOP-LEVEL load of the old url — what following
    // a stale link or a search result actually does, rather than a client-side nav from inside the app.
    app = await launchApp({ path: '/overview' })
    const { page } = app

    for (const [from, pathname, search] of REDIRECTS) {
      await page.goto(`${BASE}${from}`, { waitUntil: 'networkidle2', timeout: 45000 })
      await page.waitForFunction(p => window.location.pathname === p, { timeout: 20000 }, pathname)
      // Paired with `from` so a failure names the url that didn't land, not just the path that did.
      const landed = await page.evaluate(() => window.location.pathname + window.location.search)
      expect([from, landed]).toEqual([from, `${pathname}${search}`])
    }
  })
})
