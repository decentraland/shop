import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, BASE, type App } from './helpers/app'

/**
 * /authorizations no longer renders anything — it sends the visitor to the marketplace, which is where
 * on-chain authorizations live and where the same grants are already listed.
 *
 * Nothing else covers this. The route is in histories and bookmarks (it was a navbar tab), and it is an
 * EXTERNAL navigation, so a client-side <Navigate> assertion would not catch a regression: the failure
 * mode is staying inside the SPA on a route whose page has been deleted, which renders the 404.
 *
 * The expected url is asserted in full rather than "left the shop", because the destination is
 * per-environment (decentraland.{zone,today,org}) and landing a .zone visitor on .org is the bug this
 * would have to catch.
 */

// Asserted literally rather than read from config: landing a .zone visitor on .org is the bug this has to
// catch, and a spec that derives the url from the same source as the app would follow it there. What makes
// this the right literal: helpers/app.ts `hermeticViteEnv` does not override VITE_DCL_DEFAULT_ENV, which
// defaults to 'dev', whose config/env/dev.json sets MARKETPLACE_URL to the .zone host. If this spec ever
// fails on the url, check that chain before suspecting the redirect.
const SETTINGS = 'https://decentraland.zone/marketplace/settings'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

async function landsOnSettings(app: App, from: string) {
  const { page } = app
  await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(url => window.location.href === url, { timeout: 30000 }, SETTINGS)
  return page.url()
}

describe('the retired approvals route', () => {
  it('should send a signed-in visitor to the marketplace settings page', async () => {
    app = await launchApp({ path: '/overview' })
    expect(await landsOnSettings(app, '/authorizations')).toBe(SETTINGS)
  })

  /**
   * The Shop is served under /shop in production, where main.tsx derives the router basename from the
   * pathname. A redirect built as a relative path would resolve against the wrong base here and strand
   * the visitor inside the app.
   */
  it('should send a visitor entering under the /shop basename to the same place', async () => {
    app = await launchApp({ path: '/overview' })
    expect(await landsOnSettings(app, '/shop/authorizations')).toBe(SETTINGS)
  })

  /**
   * Signed out matters on its own: the redirect must not wait on wallet restoration. Someone following a
   * stale bookmark in a fresh browser is the likeliest way this route is reached at all.
   */
  it('should send a signed-out visitor there too, without waiting on a wallet', async () => {
    app = await launchApp({ path: '/overview', signedOut: true })
    expect(await landsOnSettings(app, '/authorizations')).toBe(SETTINGS)
  })
})
