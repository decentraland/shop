import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// Config is mutated per-test to drive isMockPayments(): real mode needs the Stripe publishable key
// (the checkout/webhook endpoints live on the always-configured credits-server). Default (empty) →
// mock mode, which keeps the mock-path tests below honest.
const { config } = vi.hoisted(() => ({ config: { stripePublishableKey: '', shopServerUrl: '' } }))
vi.mock('~/config', () => ({ config }))

// The real Stripe seam lives in payments-stripe.ts; payments.ts only delegates to it. Stub both
// exports so we can assert the delegation (args + passthrough) without any network / Stripe.
const { createPackCheckoutReal, pollCreditGrantReal } = vi.hoisted(() => ({
  createPackCheckoutReal: vi.fn(),
  pollCreditGrantReal: vi.fn()
}))
vi.mock('~/lib/payments-stripe', () => ({ createPackCheckoutReal, pollCreditGrantReal }))

// devMintUsd is the local-dev top-up the mock poll calls when an address is supplied. Stub it so the
// dev-mint branch can be exercised (success + failure) without a credits-server.
const { devMintUsd } = vi.hoisted(() => ({ devMintUsd: vi.fn() }))
vi.mock('~/lib/credits', () => ({ devMintUsd }))

// eslint-disable-next-line import/first
import {
  CREDIT_PACKS,
  MOCK_CLIENT_SECRET_PREFIX,
  USD_PER_CREDIT,
  createPackCheckout,
  creditsForUsd,
  getPack,
  isMockPayments,
  pollCreditGrant,
  usdForCredits
} from '~/lib/payments'

const IDENTITY = {} as AuthIdentity

// Flip config into real mode (Stripe key + shop-server both set) for the real-path branches.
function enableRealMode() {
  config.stripePublishableKey = 'pk_test_123'
  config.shopServerUrl = 'https://shop.example'
}

beforeEach(() => {
  createPackCheckoutReal.mockReset()
  pollCreditGrantReal.mockReset()
  devMintUsd.mockReset()
  config.stripePublishableKey = ''
  config.shopServerUrl = ''
})

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

  it('should round to whole credits for non-peg-aligned USD amounts', () => {
    expect(creditsForUsd(0)).toBe(0)
    expect(creditsForUsd(0.17)).toBe(2)
    expect(creditsForUsd(0.12)).toBe(1)
  })

  it('should round usd back to cents and never leak floating-point noise', () => {
    expect(usdForCredits(0)).toBe(0)
    expect(usdForCredits(3)).toBe(0.3)
    expect(usdForCredits(7)).toBe(0.7)
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

describe('when deciding mock vs real payments from config', () => {
  it('should run in mock mode when neither the stripe key nor the shop-server is set', () => {
    expect(isMockPayments()).toBe(true)
  })

  it('should run in real mode when the stripe publishable key is set (endpoints are on credits-server)', () => {
    config.stripePublishableKey = 'pk_test_123'
    expect(isMockPayments()).toBe(false)
  })

  it('should stay in mock mode when only the shop-server url is set (no stripe key)', () => {
    config.shopServerUrl = 'https://shop.example'
    expect(isMockPayments()).toBe(true)
  })

  it('should run in real mode only when both are set', () => {
    enableRealMode()
    expect(isMockPayments()).toBe(false)
  })
})

describe('when buying a credit pack in mock mode', () => {
  it('should create a mock checkout session for a known pack', async () => {
    const session = await createPackCheckout('pack_10')
    expect(session.mock).toBe(true)
    expect(session.clientSecret).toBe(`${MOCK_CLIENT_SECRET_PREFIX}pack_10`)
    expect(session.orderId).toContain('pack_10')
    expect(session.orderId.startsWith(MOCK_CLIENT_SECRET_PREFIX)).toBe(true)
  })

  it('and the pack is unknown it should reject before touching the mode branch', async () => {
    await expect(createPackCheckout('pack_nope')).rejects.toThrow(/unknown pack/i)
  })

  it('should not call the real Stripe checkout while mocked', async () => {
    await createPackCheckout('pack_5')
    expect(createPackCheckoutReal).not.toHaveBeenCalled()
  })

  it('should grant the pack credits after polling', async () => {
    const session = await createPackCheckout('pack_50')
    const result = await pollCreditGrant(session.orderId, { intervalMs: 1 })
    expect(result.status).toBe('credited')
    expect(result.creditsGranted).toBe(500)
    expect(result.newBalance).toBe(500)
  })
})

describe('when buying a credit pack in real mode', () => {
  it('should reject an unknown pack before requiring auth', async () => {
    enableRealMode()
    await expect(createPackCheckout('pack_nope', { address: '0xabc', identity: IDENTITY })).rejects.toThrow(
      /unknown pack/i
    )
    expect(createPackCheckoutReal).not.toHaveBeenCalled()
  })

  it('should reject when the buyer is not signed in', async () => {
    enableRealMode()
    await expect(createPackCheckout('pack_10')).rejects.toThrow(/sign in/i)
    expect(createPackCheckoutReal).not.toHaveBeenCalled()
  })

  it('should reject when auth is present but carries no identity', async () => {
    enableRealMode()
    await expect(createPackCheckout('pack_10', { address: '0xabc', identity: undefined })).rejects.toThrow(/sign in/i)
    expect(createPackCheckoutReal).not.toHaveBeenCalled()
  })

  it('should delegate to the real Stripe checkout with the packId and identity', async () => {
    enableRealMode()
    const realSession = { orderId: 'ord_1', clientSecret: 'cs_test_123', mock: false }
    createPackCheckoutReal.mockResolvedValueOnce(realSession)

    const session = await createPackCheckout('pack_25', { address: '0xabc', identity: IDENTITY })

    expect(session).toBe(realSession)
    expect(createPackCheckoutReal).toHaveBeenCalledTimes(1)
    expect(createPackCheckoutReal).toHaveBeenCalledWith('pack_25', IDENTITY)
  })
})

describe('when polling a credit grant in mock mode via the mock config', () => {
  it('should resolve credited without an address (pure mock, no dev-mint)', async () => {
    const session = await createPackCheckout('pack_25')
    const result = await pollCreditGrant(session.orderId, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: 250, newBalance: 250 })
    expect(devMintUsd).not.toHaveBeenCalled()
  })

  it('should report zero credits for a mock order whose pack id is unknown', async () => {
    const result = await pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_bogus_1700000000000`, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: 0, newBalance: 0 })
  })

  it('should top up the real balance via dev-mint when an address is supplied', async () => {
    devMintUsd.mockResolvedValueOnce({ id: 'm1', usdCents: 1000, balanceCents: 1000, credits: 137 })
    const session = await createPackCheckout('pack_10')

    const result = await pollCreditGrant(session.orderId, { intervalMs: 1, address: '0xABC' })

    expect(devMintUsd).toHaveBeenCalledTimes(1)
    expect(devMintUsd).toHaveBeenCalledWith('0xABC', 1000)
    // creditsGranted comes from the pack peg, newBalance from the dev-mint response.
    expect(result).toEqual({ status: 'credited', creditsGranted: 100, newBalance: 137 })
  })

  it('should report failed when the dev-mint top-up throws', async () => {
    devMintUsd.mockRejectedValueOnce(new Error('mint boom'))
    const session = await createPackCheckout('pack_5')

    const result = await pollCreditGrant(session.orderId, { intervalMs: 1, address: '0xABC' })

    expect(result).toEqual({ status: 'failed', error: 'mint boom' })
  })

  it('should not dev-mint when an address is given but the mock order pack is unknown', async () => {
    const result = await pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_bogus_1700000000000`, {
      intervalMs: 1,
      address: '0xABC'
    })
    expect(devMintUsd).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'credited', creditsGranted: 0, newBalance: 0 })
  })
})

describe('when polling a credit grant with a mock order id even though config is real', () => {
  it('should still take the mock path for a mock-prefixed order id', async () => {
    enableRealMode()
    const result = await pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_25_1700000000000`, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: 250, newBalance: 250 })
    expect(pollCreditGrantReal).not.toHaveBeenCalled()
  })
})

describe('when polling a credit grant in real mode', () => {
  it('should reject when the buyer is not signed in', async () => {
    enableRealMode()
    await expect(pollCreditGrant('ord_1', { intervalMs: 1 })).rejects.toThrow(/sign in/i)
    expect(pollCreditGrantReal).not.toHaveBeenCalled()
  })

  it('should delegate to the real poller with the identity and forwarded options', async () => {
    enableRealMode()
    const controller = new AbortController()
    const realResult = { status: 'credited', creditsGranted: 250, newBalance: 250 } as const
    pollCreditGrantReal.mockResolvedValueOnce(realResult)

    const result = await pollCreditGrant('ord_1', {
      intervalMs: 1,
      timeoutMs: 2,
      signal: controller.signal,
      identity: IDENTITY
    })

    expect(result).toBe(realResult)
    expect(pollCreditGrantReal).toHaveBeenCalledTimes(1)
    expect(pollCreditGrantReal).toHaveBeenCalledWith('ord_1', IDENTITY, {
      intervalMs: 1,
      timeoutMs: 2,
      signal: controller.signal
    })
  })
})
