import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ManaRate } from '~/lib/mana-rate'

// Values the mocked on-chain aggregator returns; tweaked per-test to drive readManaUsdRate branches.
let aggAddr = '0xaggregator'
let aggDecimals = 8
let aggAnswer = '50000000' // int256 latestRoundData answer (rate)
// Round metadata. `aggUpdatedAt = null` → the aggregator reports "now" (fresh); set a number to force
// a specific epoch-seconds updatedAt (e.g. an old one → stale). roundId/answeredInRound drive completeness.
let aggUpdatedAt: number | null = null
let aggRoundId = 1
let aggAnsweredInRound = 1

vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

// Keep real ethers (BigNumber etc.); swap Contract so oracle reads don't hit a chain, and stub the
// JsonRpcProvider so no socket is opened. The single MockContract dispatches by method name: the
// marketplace read returns the aggregator address; the aggregator read returns decimals + roundData.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public provider: unknown
    ) {}
    async manaUsdAggregator() {
      return aggAddr
    }
    async decimals() {
      return aggDecimals
    }
    async latestRoundData() {
      // [roundId, answer, startedAt, updatedAt, answeredInRound].
      const updatedAt = aggUpdatedAt ?? Math.floor(Date.now() / 1000)
      return [aggRoundId, actual.ethers.BigNumber.from(aggAnswer), 0, updatedAt, aggAnsweredInRound]
    }
  }
  class MockJsonRpcProvider {
    constructor(public url: string) {}
  }
  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: { ...actual.ethers.providers, JsonRpcProvider: MockJsonRpcProvider }
    }
  }
})

import { readManaUsdRate, manaWeiToUsdWei, manaWeiToCredits, manaWeiToUsdCents } from '~/lib/mana-rate'

// $0.50 per MANA at 8 decimals: rate 50000000, decimals 8 → manaWei * 5e7 / 1e8 = manaWei / 2.
const RATE_HALF: ManaRate = { rate: 50000000n, decimals: 8 }
// $2.00 per MANA at 8 decimals.
const RATE_TWO: ManaRate = { rate: 200000000n, decimals: 8 }
const ONE_MANA = '1000000000000000000' // 1e18 wei

describe('when reading the MANA/USD rate off the marketplace oracle', () => {
  beforeEach(() => {
    aggAddr = '0xaggregator'
    aggDecimals = 8
    aggAnswer = '50000000'
    aggUpdatedAt = null // fresh by default
    aggRoundId = 1
    aggAnsweredInRound = 1
  })

  it('should return the aggregator answer and decimals as a ManaRate', async () => {
    const result = await readManaUsdRate()
    expect(result).toEqual({ rate: 50000000n, decimals: 8 })
  })

  it('should coerce the returned decimals to a number', async () => {
    aggDecimals = 18
    const result = await readManaUsdRate()
    expect(result.decimals).toBe(18)
    expect(typeof result.decimals).toBe('number')
  })

  it('and the oracle answer is zero it should throw so callers can disable Buy Now', async () => {
    aggAnswer = '0'
    await expect(readManaUsdRate()).rejects.toThrow(/mana rate unavailable/)
  })

  it('and the oracle answer is negative it should throw', async () => {
    aggAnswer = '-1'
    await expect(readManaUsdRate()).rejects.toThrow(/mana rate unavailable/)
  })

  it('should accept an explicit chainId argument', async () => {
    const result = await readManaUsdRate(137)
    expect(result).toEqual({ rate: 50000000n, decimals: 8 })
  })

  it('and the round has not updated within the heartbeat it should throw stale', async () => {
    // Updated two days ago (> 24h max staleness) → a stuck feed we must not price off.
    aggUpdatedAt = Math.floor(Date.now() / 1000) - 2 * 86400
    await expect(readManaUsdRate()).rejects.toThrow(/stale/)
  })

  it('and updatedAt is zero (never set) it should throw stale', async () => {
    aggUpdatedAt = 0
    await expect(readManaUsdRate()).rejects.toThrow(/stale/)
  })

  it('and the answer was carried over from an earlier round it should throw incomplete', async () => {
    aggRoundId = 10
    aggAnsweredInRound = 9 // answeredInRound < roundId → not fresh for this round
    await expect(readManaUsdRate()).rejects.toThrow(/incomplete/)
  })

  it('should accept a fresh, complete round', async () => {
    aggUpdatedAt = Math.floor(Date.now() / 1000) - 60 // a minute ago, well within the heartbeat
    aggRoundId = 5
    aggAnsweredInRound = 5
    const result = await readManaUsdRate()
    expect(result).toEqual({ rate: 50000000n, decimals: 8 })
  })
})

describe('when converting MANA wei to USD wei', () => {
  it('should apply the rate and scale by the aggregator decimals', () => {
    // 1 MANA at $0.50 → 5e17 USD wei ($0.50).
    expect(manaWeiToUsdWei(ONE_MANA, RATE_HALF)).toBe(500000000000000000n)
  })

  it('and the rate is above one dollar it should scale up', () => {
    // 1 MANA at $2.00 → 2e18 USD wei ($2.00).
    expect(manaWeiToUsdWei(ONE_MANA, RATE_TWO)).toBe(2000000000000000000n)
  })

  it('should return a bigint zero for zero mana wei', () => {
    expect(manaWeiToUsdWei('0', RATE_HALF)).toBe(0n)
  })

  it('and the mana wei is malformed it should throw (BigInt parse error)', () => {
    expect(() => manaWeiToUsdWei('not-a-number', RATE_HALF)).toThrow()
  })
})

describe('when converting MANA wei to credits', () => {
  it('should round up so the shown price never sits below the checkout charge', () => {
    // 1 MANA at $2.00 = $2.00 = 20 credits exactly.
    expect(manaWeiToCredits(ONE_MANA, RATE_TWO)).toBe(20)
  })

  it('and the USD value has a fractional credit it should ceil', () => {
    // 1 MANA at $0.50 = $0.50 = 5 credits exactly (no remainder).
    expect(manaWeiToCredits(ONE_MANA, RATE_HALF)).toBe(5)
    // 1.05 MANA at $0.10/credit peg with a remainder → ceils up.
    // 3e17 wei MANA at $2.00 → 6e17 USD wei = $0.60 = 6 credits.
    expect(manaWeiToCredits('300000000000000000', RATE_TWO)).toBe(6)
    // 3.5e17 wei MANA at $2.00 → 7e17 USD wei = $0.70 → 7 credits (exact).
    // 3.6e17 wei MANA at $2.00 → 7.2e17 USD wei = $0.72 → ceils to 8 credits.
    expect(manaWeiToCredits('360000000000000000', RATE_TWO)).toBe(8)
  })

  it('should floor the credit price at 1 credit for dust amounts', () => {
    // 1 wei MANA → 0 USD wei (integer division) → 0 credits → floored at 1.
    expect(manaWeiToCredits('1', RATE_HALF)).toBe(1)
    // 5e16 wei MANA at $2.00 → 1e17 USD wei = $0.10 = exactly 1 credit.
    expect(manaWeiToCredits('50000000000000000', RATE_TWO)).toBe(1)
  })

  it('should floor at 1 credit when the price rounds to zero credits', () => {
    // 0 mana wei → 0 usd wei → 0 credits → floored to 1.
    expect(manaWeiToCredits('0', RATE_HALF)).toBe(1)
  })

  it('and the mana wei is malformed it should return null so the UI can show unavailable', () => {
    expect(manaWeiToCredits('oops', RATE_HALF)).toBeNull()
    expect(manaWeiToCredits('12.5', RATE_HALF)).toBeNull()
  })
})

describe('when converting MANA wei to USD cents', () => {
  it('should round up to whole cents', () => {
    // 1 MANA at $2.00 → 2e18 USD wei = 200 cents exactly.
    expect(manaWeiToUsdCents(ONE_MANA, RATE_TWO)).toBe(200)
  })

  it('should ceil a fractional cent up', () => {
    // 3e16 wei MANA at $2.00 → 6e16 USD wei = 0.06 cents-worth: whole = 6 (6e16/1e16), remainder 0 → 6 cents.
    expect(manaWeiToUsdCents('30000000000000000', RATE_TWO)).toBe(6)
    // 2.5e16 wei MANA at $2.00 → 5e16 USD wei: whole = 5, remainder 0 → 5 cents.
    // 2.6e16 wei MANA at $2.00 → 5.2e16 USD wei: whole = 5, remainder 0.2e16 > 0 → ceils to 6 cents.
    expect(manaWeiToUsdCents('26000000000000000', RATE_TWO)).toBe(6)
  })

  it('should ceil the tiniest non-zero USD wei up to 1 cent', () => {
    // 1e14 wei MANA at $2.00 → 2e14 USD wei: whole = 0 (< 1e16), remainder > 0 → ceils to 1 cent.
    expect(manaWeiToUsdCents('100000000000000', RATE_TWO)).toBe(1)
  })

  it('should return 0 cents for zero mana wei', () => {
    expect(manaWeiToUsdCents('0', RATE_HALF)).toBe(0)
  })

  it('and the mana wei is malformed it should return 0', () => {
    expect(manaWeiToUsdCents('nope', RATE_HALF)).toBe(0)
    expect(manaWeiToUsdCents('12.5', RATE_HALF)).toBe(0)
  })
})
