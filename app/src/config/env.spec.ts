import { describe, it, expect } from 'vitest'

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
})
