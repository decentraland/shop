import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// Config is mutated per-test to drive isMockPayments(): real mode needs the Stripe publishable key
// (the checkout/webhook endpoints live on the always-configured credits-server). Default (empty) →
// mock mode, which keeps the mock-path tests below honest.
const { config } = vi.hoisted(() => ({
  config: { stripePublishableKey: '', shopServerUrl: '', creditsServerUrl: 'https://credits.example', chainId: 80002 }
}))
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

import {
  CREDIT_PACKS,
  MOCK_CLIENT_SECRET_PREFIX,
  USD_PER_CREDIT,
  createPackCheckout,
  creditsForUsd,
  fetchCreditPacks,
  getPack,
  isMockPayments,
  packBonus,
  pollCreditGrant,
  usdForCredits,
  type CreditPack,
  type OrderStatus
} from '~/lib/payments'
import type { CreditOrderStatus } from '~/lib/credits'

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
  config.chainId = 80002 // Amoy testnet by default; mainnet cases set 137 explicitly
})

/**
 * The order-status union is a CONTRACT, and payments-stripe casts the response onto it — so a status the
 * server can send and this type omits is not a compile error anywhere, it is a value that falls through
 * every branch on the page. That is how 'crediting' and 'initiated' reached production as an error screen
 * shown to buyers who had been charged.
 */
describe('when typing the order status the server can return', () => {
  it('should cover every status in the credits-server vocabulary', () => {
    // Keyed by the SERVER's union: this object stops COMPILING the moment OrderStatus['status'] is narrower
    // than CreditOrderStatus — i.e. the moment anyone restates the list instead of deriving it. The runtime
    // assertion only keeps the map itself from going stale.
    const covered: Record<CreditOrderStatus, OrderStatus['status']> = {
      initiated: 'initiated',
      processing: 'processing',
      crediting: 'crediting',
      credited: 'credited',
      failed: 'failed',
      abandoned: 'abandoned'
    }

    expect(Object.keys(covered).sort()).toEqual(
      ['abandoned', 'credited', 'crediting', 'failed', 'initiated', 'processing'].sort()
    )
  })
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

  it('and the pack catalogue should be fee-adjusted (credits ≤ the raw peg — the premium covers card fees)', () => {
    // Break-even packs charge a small premium over the credits' spend value, so credits < usd×10.
    // Under the old flat peg they were equal; that no longer holds (see credits-server credit-pack-catalog).
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThan(0)
      expect(pack.credits).toBeLessThanOrEqual(creditsForUsd(pack.usd))
    }
  })

  it('should highlight exactly one best-value pack (the mid Popular pack)', () => {
    const best = CREDIT_PACKS.filter(p => p.bestValue)
    expect(best).toHaveLength(1)
    expect(best[0].id).toBe('pack_10')
  })
})

describe('when computing the bonus a pack carries over the entry rate', () => {
  // The entry pack sets the reference rate, so these fixtures only need a rate and a size — the real
  // catalogue is asserted separately by the ladder invariants on the server.
  const mk = (id: string, usd: number, credits: number): CreditPack => ({ id, usd, credits })

  it('should measure the bonus against what the same money buys at the cheapest pack rate', () => {
    const packs = [mk('a', 5.99, 40), mk('b', 11.99, 100)]
    // 40/5.99 = 6.6778 credits per $1 → $11.99 buys 80.07, floored to 80. 100 granted → +20.
    expect(packBonus(packs[1], packs)).toEqual({ baseline: 80, bonus: 20 })
  })

  it('should floor the baseline so the card never shows a fractional credit amount', () => {
    const packs = [mk('a', 5.99, 40), mk('b', 59.99, 540)]
    // Raw baseline is 400.60; a struck-through "400.6 credits" would be nonsense.
    expect(packBonus(packs[1], packs)?.baseline).toBe(400)
  })

  it('should return null for the entry pack itself, which IS the reference', () => {
    const packs = [mk('a', 5.99, 40), mk('b', 11.99, 100)]
    expect(packBonus(packs[0], packs)).toBeNull()
  })

  it('should pick the cheapest pack as the reference regardless of catalogue order', () => {
    // Order comes from the server's `order` field and is not guaranteed ascending by price.
    const unordered = [mk('big', 59.99, 540), mk('entry', 5.99, 40), mk('mid', 11.99, 100)]
    expect(packBonus(unordered[2], unordered)).toEqual({ baseline: 80, bonus: 20 })
  })

  it('should return null on a single-pack catalogue, where there is nothing to compare against', () => {
    const packs = [mk('only', 5.99, 40)]
    expect(packBonus(packs[0], packs)).toBeNull()
  })

  it('should return null on an empty catalogue rather than throwing', () => {
    expect(packBonus(mk('x', 5.99, 40), [])).toBeNull()
  })

  /**
   * The honesty guard. A badge is a claim that this pack is the better deal, so it must disappear the moment
   * the price list stops backing that claim — otherwise a careless repricing advertises a bonus that isn't
   * there. The previous ladder ($4.99→45, $9.99→90) was exactly this case.
   */
  it('should show no bonus on a flat ladder, where the bigger pack is no better per dollar', () => {
    const packs = [mk('a', 5.99, 40), mk('b', 11.98, 80)]
    expect(packBonus(packs[1], packs)).toBeNull()
  })

  it('should show no bonus on an inverted ladder, where the bigger pack is worse per dollar', () => {
    const packs = [mk('a', 4.99, 45), mk('b', 9.99, 90)]
    expect(packBonus(packs[1], packs)).toBeNull()
  })

  // NaN is the interesting one: it fails EVERY comparison, so it slips past a `usd <= 0` guard and the
  // function only returns null because NaN propagates into the arithmetic and `NaN > 0` is false. This case
  // therefore passes with or without the guard — it pins the BEHAVIOUR, not the guard. What it does catch is
  // a later change that removes the accidental safety: relaxing the final `bonus > 0` to `bonus !== 0` would
  // return `{ baseline: NaN, bonus: NaN }` and render a struck-through "NaN" on the card.
  it('should return null when the entry price is not a usable divisor', () => {
    for (const badPrice of [0, -1, Number.NaN]) {
      const packs = [mk('a', badPrice, 40), mk('b', 11.99, 100)]
      expect(packBonus(packs[1], packs)).toBeNull()
    }
  })
})

describe('when looking up a pack by id', () => {
  it('should return the matching pack', () => {
    // Assert the identity, not the field values. Restating the price here breaks the suite on every
    // repricing without testing anything extra; reading the expectation back out of CREDIT_PACKS with the
    // same `find` getPack uses internally is worse still — it only checks that `find` agrees with itself.
    // Pinning that the returned object IS the catalogue entry covers the lookup and rules out a copy or a
    // transform on the way out, which is what callers rely on.
    expect(getPack('pack_25')).toBe(CREDIT_PACKS[2])
    expect(getPack('pack_25')?.id).toBe('pack_25')
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

describe('when the deployment is a real-money (non-test) environment', () => {
  it('should fail hard instead of falling back to mock when the stripe key is missing on Polygon mainnet', () => {
    config.chainId = 137
    config.stripePublishableKey = ''
    expect(() => isMockPayments()).toThrow(/chainId=137, which is not a recognized test network/)
  })

  it('should also fail hard on Ethereum mainnet when the stripe key is missing', () => {
    config.chainId = 1
    config.stripePublishableKey = ''
    expect(() => isMockPayments()).toThrow(/real-money environment/)
  })

  it('should fail closed on an unknown / unrecognized chain id when the stripe key is missing', () => {
    config.chainId = 424242 // not a known test network
    config.stripePublishableKey = ''
    expect(() => isMockPayments()).toThrow(/not a recognized test network/)
  })

  it('should fail closed on a malformed (NaN) chain id when the stripe key is missing', () => {
    config.chainId = Number.NaN
    config.stripePublishableKey = ''
    expect(() => isMockPayments()).toThrow(/not a recognized test network/)
  })

  it('should run in real mode (no throw) when the stripe key IS set on mainnet', () => {
    config.chainId = 137
    config.stripePublishableKey = 'pk_live_123'
    expect(isMockPayments()).toBe(false)
  })

  it('should still allow mock mode on a known test network when the stripe key is missing', () => {
    config.chainId = 80002
    config.stripePublishableKey = ''
    expect(isMockPayments()).toBe(true)
  })
})

describe('when a real-money environment is misconfigured, the money entry points fail hard', () => {
  it('createPackCheckout should throw rather than start a mock checkout on mainnet with no stripe key', async () => {
    config.chainId = 137
    config.stripePublishableKey = ''
    await expect(createPackCheckout('pack_10')).rejects.toThrow(/not a recognized test network/)
  })

  it('pollCreditGrant should throw on mainnet with no key EVEN for a mock-prefixed order id', async () => {
    config.chainId = 137
    config.stripePublishableKey = ''
    await expect(pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_10_123`)).rejects.toThrow(
      /not a recognized test network/
    )
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
    const credits = CREDIT_PACKS.find(p => p.id === 'pack_50')!.credits
    const session = await createPackCheckout('pack_50')
    const result = await pollCreditGrant(session.orderId, { intervalMs: 1 })
    expect(result.status).toBe('credited')
    expect(result.creditsGranted).toBe(credits)
    expect(result.newBalance).toBe(credits)
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
    const realSession = { orderId: 'ord_1', url: 'https://checkout.stripe.com/c/pay/cs_test_123', mock: false }
    createPackCheckoutReal.mockResolvedValueOnce(realSession)

    const session = await createPackCheckout('pack_25', { address: '0xabc', identity: IDENTITY })

    expect(session).toBe(realSession)
    expect(createPackCheckoutReal).toHaveBeenCalledTimes(1)
    expect(createPackCheckoutReal).toHaveBeenCalledWith('pack_25', IDENTITY)
  })
})

describe('when polling a credit grant in mock mode via the mock config', () => {
  it('should resolve credited without an address (pure mock, no dev-mint)', async () => {
    const credits = CREDIT_PACKS.find(p => p.id === 'pack_25')!.credits
    const session = await createPackCheckout('pack_25')
    const result = await pollCreditGrant(session.orderId, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: credits, newBalance: credits })
    expect(devMintUsd).not.toHaveBeenCalled()
  })

  it('should report zero credits for a mock order whose pack id is unknown', async () => {
    const result = await pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_bogus_1700000000000`, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: 0, newBalance: 0 })
  })

  it('should top up the real balance via dev-mint when an address is supplied', async () => {
    const credits = CREDIT_PACKS.find(p => p.id === 'pack_10')!.credits
    devMintUsd.mockResolvedValueOnce({ id: 'm1', usdCents: 1000, balanceCents: 1000, credits: 137 })
    const session = await createPackCheckout('pack_10')

    const result = await pollCreditGrant(session.orderId, { intervalMs: 1, address: '0xABC' })

    expect(devMintUsd).toHaveBeenCalledTimes(1)
    // Mock-mint tops up the SPEND value (credits × $0.10), not the charge — that gap is the Stripe wedge.
    expect(devMintUsd).toHaveBeenCalledWith('0xABC', credits * 10)
    // creditsGranted comes from the pack's credit amount, newBalance from the dev-mint response.
    expect(result).toEqual({ status: 'credited', creditsGranted: credits, newBalance: 137 })
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
    const credits = CREDIT_PACKS.find(p => p.id === 'pack_25')!.credits
    const result = await pollCreditGrant(`${MOCK_CLIENT_SECRET_PREFIX}pack_25_1700000000000`, { intervalMs: 1 })
    expect(result).toEqual({ status: 'credited', creditsGranted: credits, newBalance: credits })
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

describe('when fetching the credit-pack catalogue from the credits-server', () => {
  it('should GET the public /credits/packs endpoint and map recommended -> bestValue, ordered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // Deliberately out of order to prove the client sorts by `order`.
        packs: [
          { id: 'pack_25', usd: 25, credits: 250, recommended: true, order: 3 },
          { id: 'pack_5', usd: 5, credits: 50, order: 1 },
          { id: 'pack_10', usd: 10, credits: 100, order: 2 }
        ]
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    expect(fetchMock).toHaveBeenCalledWith('https://credits.example/credits/packs')
    expect(packs).toEqual([
      { id: 'pack_5', usd: 5, credits: 50 },
      { id: 'pack_10', usd: 10, credits: 100 },
      { id: 'pack_25', usd: 25, credits: 250, bestValue: true }
    ])
    vi.unstubAllGlobals()
  })

  it('should prefer the webp artwork over the png, which exists for clients that cannot decode webp', async () => {
    // Both formats are published because the constraint is per-client: Unity needs the PNG, a browser
    // would pay ~7× for it. The shop is a browser.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        packs: [{ id: 'pack_5', usd: 4.99, credits: 45, order: 1, imageUrl: '/a.png', imageUrlWebp: '/a.webp' }]
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    expect(packs[0].artUrl).toBe('/a.webp')
    vi.unstubAllGlobals()
  })

  it('should fall through to the png when the catalogue publishes only that', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ packs: [{ id: 'pack_5', usd: 4.99, credits: 45, order: 1, imageUrl: '/a.png' }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    expect(packs[0].artUrl).toBe('/a.png')
    vi.unstubAllGlobals()
  })

  it('should omit the artwork entirely when the catalogue publishes none, so the grid uses its bundled art', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ packs: [{ id: 'pack_5', usd: 4.99, credits: 45, order: 1 }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    // Absent rather than undefined-valued: the grid checks presence to decide whether to draw its own art.
    expect('artUrl' in packs[0]).toBe(false)
    vi.unstubAllGlobals()
  })

  it('should treat an empty artwork url as missing rather than rendering a blank image', async () => {
    // The guard and the value used to disagree (`||` vs `??`): a blank webp field would win over a real
    // PNG and set an empty src. Empty means missing, in both halves.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        packs: [{ id: 'pack_5', usd: 4.99, credits: 45, order: 1, imageUrl: '/a.png', imageUrlWebp: '' }]
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    expect(packs[0].artUrl).toBe('/a.png')
    vi.unstubAllGlobals()
  })

  it('should omit the artwork when every url the catalogue sends is blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        packs: [{ id: 'pack_5', usd: 4.99, credits: 45, order: 1, imageUrl: '', imageUrlWebp: '' }]
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const packs = await fetchCreditPacks()

    expect('artUrl' in packs[0]).toBe(false)
    vi.unstubAllGlobals()
  })

  it('should throw on a non-ok response so the hook can fall back to the bundled packs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' }))
    await expect(fetchCreditPacks()).rejects.toThrow(/credit packs 503/)
    vi.unstubAllGlobals()
  })
})
