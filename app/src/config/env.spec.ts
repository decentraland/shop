import { describe, it, expect } from 'vitest'

import { isLiveHost } from './index'

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
 * The host check behind `config.previewHost`, which decides whether `?viewAs=`, `?mock=1`, `?ff=` and
 * `?ffv=` are honoured. A wrong answer here opens those overrides on the live Shop, so the cases below are
 * the gate's contract rather than illustrations of it.
 */
describe('isLiveHost', () => {
  it.each(['shop.decentraland.org', 'decentraland.org', 'decentraland.co', 'decentraland.today', 'shop.example.net'])(
    'treats %s as a live deployment',
    host => {
      expect(isLiveHost(host)).toBe(true)
    }
  )

  it.each(['localhost', '127.0.0.1', 'shop.decentraland.zone', 'shop-git-branch.vercel.app'])(
    'treats %s as a preview deployment',
    host => {
      expect(isLiveHost(host)).toBe(false)
    }
  )

  /**
   * A fully qualified name may carry a trailing dot, `location.hostname` keeps it, and DNS resolves it the
   * same — so without stripping it `https://shop.decentraland.org./` reaches production with a hostname the
   * anchored pattern misses, and every override is on.
   */
  it('strips a trailing dot before deciding, so a rooted FQDN cannot slip past', () => {
    expect(isLiveHost('shop.decentraland.org.')).toBe(true)
    expect(isLiveHost('decentraland.today.')).toBe(true)
  })

  it('ignores case', () => {
    expect(isLiveHost('SHOP.DECENTRALAND.ORG')).toBe(true)
  })

  it('does not fire on a TLD that merely contains one of the live ones', () => {
    expect(isLiveHost('shop.decentraland.organic')).toBe(false)
    expect(isLiveHost('preview.network')).toBe(false)
  })
})
