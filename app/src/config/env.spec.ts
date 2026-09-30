import { describe, it, expect } from 'vitest'

import { isPreviewHost } from './index'

import dev from './env/dev.json'
import stg from './env/stg.json'
import prod from './env/prod.json'

/**
 * THE PER-ENV JSONS ARE THE ONLY SOURCE OF HOSTS, and two of them must agree with each other.
 *
 * This exists because `RELAYER_URL` was not here at all: `lib/gasless-config.ts` read VITE_RELAYER_URL
 * directly and fell back to a hard-coded zone (Amoy) relayer. Production therefore tried to relay through
 * zone, its CSP refused the request, and every gasless purchase fell through to a buyer-submitted
 * transaction — silently, because a default pointing at the wrong environment does not fail, it works
 * wrongly. Nothing in the suite could have caught that, since the key it needed did not exist.
 *
 * The relayer is CHAIN-BOUND: it only submits on the chain it is configured for, so it has to move with
 * CHAIN_ID rather than with the hostname of the deployment. stg is the case that makes this worth asserting —
 * it runs Polygon MAINNET, so it needs the org relayer even though it is not production.
 */
const ENVS = [
  { name: 'dev', json: dev as Record<string, string> },
  { name: 'stg', json: stg as Record<string, string> },
  { name: 'prod', json: prod as Record<string, string> }
]

const POLYGON_MAINNET = '137'
const AMOY = '80002'

describe('per-env config JSONs', () => {
  it.each(ENVS)('$name defines a relayer URL', ({ json }) => {
    // Absent is the failure mode that shipped: there is deliberately no fallback in code any more, so an
    // empty value would break gasless outright instead of pointing somewhere wrong.
    expect(json.RELAYER_URL).toMatch(/^https:\/\/\S+\/v1$/)
  })

  it.each(ENVS)('$name relayer targets the same chain as CHAIN_ID', ({ json }) => {
    expect([POLYGON_MAINNET, AMOY]).toContain(json.CHAIN_ID)
    // The org relayer submits on Polygon mainnet, the zone one on Amoy. Pairing them by host is what keeps a
    // copy-paste between environments from relaying to a chain the Shop is not trading on.
    const expectedHost = json.CHAIN_ID === POLYGON_MAINNET ? 'decentraland.org' : 'decentraland.zone'
    expect(new URL(json.RELAYER_URL).hostname).toBe(`transactions-api.${expectedHost}`)
  })

  it('keeps stg on mainnet hosts, since it is not a testnet', () => {
    // Guards the assumption a reader is most likely to get wrong: "stg" reads as a test environment, but it
    // trades on Polygon mainnet, so its relayer and RPC are the production ones.
    expect(stg.CHAIN_ID).toBe(POLYGON_MAINNET)
    expect(new URL(stg.RELAYER_URL).hostname).toContain('decentraland.org')
  })

  it.each(ENVS)('$name points at the marketing CMS', ({ json }) => {
    expect(new URL(json.CONTENTFUL_URL).hostname).toBe('cms-api.decentraland.org')
    expect(json.CONTENTFUL_SPACE_ID).toBeTruthy()
    expect(json.CONTENTFUL_ENVIRONMENT).toBeTruthy()
  })

  it('keeps the dev campaign entry separate from the published one', () => {
    // The admin entry is the ONLY per-environment value in the CMS block: dev reads a test entry, so a
    // draft banner can be staged without going live the moment it is saved.
    expect(dev.CONTENTFUL_ADMIN_ENTITY_ID).not.toBe(prod.CONTENTFUL_ADMIN_ENTITY_ID)
  })

  it('reads the published campaign on stg, like every other production surface it points at', () => {
    // Deliberate, and the same split the Marketplace ships. Staging is not a second dev: it reads the
    // production APIs and Polygon mainnet, so reading a different CMS entry there would rehearse a
    // campaign nobody is about to launch. Previewing a draft is what dev is for — or a local
    // VITE_CONTENTFUL_ADMIN_ENTITY_ID override.
    expect(stg.CONTENTFUL_ADMIN_ENTITY_ID).toBe(prod.CONTENTFUL_ADMIN_ENTITY_ID)
  })
})

/**
 * The host check behind `config.previewHost`, which decides whether `?mock=1`, `?ff=` and `?ffv=` are
 * honoured. A wrong answer opens those overrides on the live Shop, so the cases below are the
 * gate's contract rather than illustrations of it.
 */
describe('isPreviewHost', () => {
  it.each(['localhost', '127.0.0.1', 'shop.decentraland.zone', 'decentraland.zone', 'shop-git-branch.vercel.app'])(
    'lets %s use the preview overrides',
    host => {
      expect(isPreviewHost(host)).toBe(true)
    }
  )

  it.each(['decentraland.org', 'shop.decentraland.org', 'decentraland.today', 'decentraland.co', 'decentraland.net'])(
    'keeps %s away from them',
    host => {
      expect(isPreviewHost(host)).toBe(false)
    }
  )

  /**
   * The point of the allowlist: a host nobody listed gets nothing. Under a denylist of the live TLDs each
   * of these would have been a live Shop with the flag overrides open.
   */
  it.each(['shop.decentraland.com', 'shop.example.io', '203.0.113.7', 'shop-cdn-origin.internal'])(
    'refuses %s, which nobody listed either way',
    host => {
      expect(isPreviewHost(host)).toBe(false)
    }
  )

  /**
   * A fully qualified name may carry a trailing dot and `location.hostname` keeps it, so the comparison has
   * to normalise or a legitimate preview is locked out — and under the denylist this replaced, the same
   * detail let `decentraland.org.` through as a preview.
   */
  it('strips a trailing dot before deciding', () => {
    expect(isPreviewHost('shop.decentraland.zone.')).toBe(true)
    expect(isPreviewHost('decentraland.org.')).toBe(false)
  })

  it('ignores case', () => {
    expect(isPreviewHost('SHOP.DECENTRALAND.ZONE')).toBe(true)
    expect(isPreviewHost('SHOP.DECENTRALAND.ORG')).toBe(false)
  })

  it('anchors on a label boundary, so a lookalike domain does not qualify', () => {
    expect(isPreviewHost('decentraland.zone.evil.com')).toBe(false)
    expect(isPreviewHost('notdecentraland.zone')).toBe(false)
    expect(isPreviewHost('myvercel.app.attacker.net')).toBe(false)
  })
})
