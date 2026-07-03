import { describe, it, expect } from 'vitest'
import {
  CREDIT_PACKS,
  USD_PER_CREDIT,
  createPackCheckout,
  creditsForUsd,
  getPack,
  isMockPayments,
  pollCreditGrant,
  usdForCredits
} from '~/lib/payments'

// No VITE_STRIPE_PK / VITE_SHOP_SERVER_URL in the test env → payments run mocked.

describe('when computing credit pack math at the fixed USD peg', () => {
  it('should grant 10 credits per dollar (1 credit = $0.10)', () => {
    expect(USD_PER_CREDIT).toBe(0.1)
    expect(creditsForUsd(5)).toBe(50)
    expect(creditsForUsd(10)).toBe(100)
    expect(creditsForUsd(25)).toBe(250)
    expect(creditsForUsd(50)).toBe(500)
  })

  it('should invert cleanly from credits back to USD', () => {
    expect(usdForCredits(50)).toBe(5)
    expect(usdForCredits(250)).toBe(25)
    expect(usdForCredits(1)).toBe(0.1)
  })

  it('and the pack catalogue should match the peg for every pack', () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBe(creditsForUsd(pack.usd))
    }
  })

  it('should expose exactly one highlighted best-value pack', () => {
    expect(CREDIT_PACKS.filter(p => p.bestValue)).toHaveLength(1)
  })
})

describe('when looking up a pack by id', () => {
  it('should return the matching pack', () => {
    expect(getPack('pack_25')).toMatchObject({ usd: 25, credits: 250 })
  })

  it('and the id is unknown it should return undefined', () => {
    expect(getPack('pack_nope')).toBeUndefined()
  })
})

describe('when no Stripe key or shop-server is configured', () => {
  it('should run in mock mode', () => {
    expect(isMockPayments()).toBe(true)
  })
})

describe('when buying a credit pack in mock mode', () => {
  it('should create a mock checkout session for a known pack', async () => {
    const session = await createPackCheckout('pack_10')
    expect(session.mock).toBe(true)
    expect(session.clientSecret).toContain('mock_cs_')
    expect(session.orderId).toContain('pack_10')
  })

  it('and the pack is unknown it should reject', async () => {
    await expect(createPackCheckout('pack_nope')).rejects.toThrow(/unknown pack/i)
  })

  it('should grant the pack credits after polling', async () => {
    const session = await createPackCheckout('pack_50')
    const result = await pollCreditGrant(session.orderId, { intervalMs: 1 })
    expect(result.status).toBe('credited')
    expect(result.creditsGranted).toBe(500)
    expect(result.newBalance).toBe(500)
  })
})
