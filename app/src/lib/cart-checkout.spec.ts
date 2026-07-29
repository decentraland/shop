import { describe, it, expect } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'
import { reviewCart, centsToCredits, type TradeResolver } from '~/lib/cart-checkout'

const BUYER = '0xBUYER'

const item = (id: string, priceCredits: number, over: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  name: `Item ${id}`,
  creator: '0xcreator',
  contractAddress: '0xcontract',
  itemId: id,
  category: 'wearable',
  rarity: 'common',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits,
  gender: null,
  isSmart: false,
  tradeId: `trade-${id}`,
  ...over
})

// A Shop-native trade priced at `dollars`, signed by `signer` (the seller). `assetType` is
// USD_PEGGED_MANA (2) — verified against the live API, which returns 2 for native and 1 for legacy — and
// the received amount is USD wei (1e18 = $1), so $2 → 2e18 wei → 200 cents → 20 credits. The assetType is
// load-bearing: it is what tells reviewCart the amount is dollars and not MANA.
const trade = (dollars: number, signer = '0xseller'): Trade =>
  ({
    signer,
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        amount: (BigInt(Math.round(dollars * 100)) * 10n ** 16n).toString()
      }
    ]
  }) as unknown as Trade

// A LEGACY trade, signed by the older Marketplace: plain ERC20, priced in MANA wei. Only the oracle can
// say what it is worth, so reviewCart needs the rate to price it.
const legacyTrade = (mana: number, signer = '0xseller'): Trade =>
  ({
    signer,
    received: [{ assetType: TradeAssetType.ERC20, amount: (BigInt(Math.round(mana * 1000)) * 10n ** 15n).toString() }]
  }) as unknown as Trade

// 1 MANA = $0.50 on an 8-decimal aggregator, so 10 MANA = $5 = 50 credits.
const RATE = { rate: 50_000_000n, decimals: 8 }

// Resolver driven by a map of item.id → trade | null | 'throw'.
const resolverFrom =
  (map: Record<string, Trade | null | 'throw'>): TradeResolver =>
  async i => {
    const r = map[i.id]
    if (r === 'throw') throw new Error('resolve failed')
    return r ?? null
  }

describe('reviewCart', () => {
  it('marks everything buyable with no price change when live prices match the cart', async () => {
    const items = [item('a', 20), item('b', 5)]
    const review = await reviewCart(items, BUYER, resolverFrom({ a: trade(2), b: trade(0.5) }))

    expect(review.buyable.map(l => l.item.id)).toEqual(['a', 'b'])
    expect(review.unavailable).toEqual([])
    expect(review.own).toEqual([])
    expect(review.liveTotalCredits).toBe(25)
    expect(review.orderChanged).toBe(false)
  })

  it('flags a price change when a live price differs from the shown price', async () => {
    // 'a' was added at 20 credits but the live listing is now $3 = 30 credits (sale ended / re-priced).
    const review = await reviewCart([item('a', 20)], BUYER, resolverFrom({ a: trade(3) }))

    expect(review.buyable[0].priceCredits).toBe(30)
    expect(review.buyable[0].usdCents).toBe(300)
    expect(review.liveTotalCredits).toBe(30)
    expect(review.orderChanged).toBe(true)
  })

  it('classifies an item with no live listing as unavailable (never throws)', async () => {
    const review = await reviewCart([item('a', 20), item('b', 10)], BUYER, resolverFrom({ a: null, b: 'throw' }))

    expect(review.buyable).toEqual([])
    expect(review.unavailable.map(i => i.id)).toEqual(['a', 'b'])
    expect(review.liveTotalCredits).toBe(0)
    expect(review.orderChanged).toBe(true)
  })

  it("classifies the buyer's own listing as own (not buyable)", async () => {
    const review = await reviewCart([item('a', 20)], BUYER, resolverFrom({ a: trade(2, BUYER.toLowerCase()) }))

    expect(review.buyable).toEqual([])
    expect(review.own.map(i => i.id)).toEqual(['a'])
    expect(review.orderChanged).toBe(true)
  })

  it('handles a mixed basket: only buyable rows count toward the live total', async () => {
    const items = [item('a', 20), item('b', 10), item('c', 5)]
    const review = await reviewCart(items, BUYER, resolverFrom({ a: trade(2), b: null, c: trade(0.5, BUYER) }))

    expect(review.buyable.map(l => l.item.id)).toEqual(['a'])
    expect(review.unavailable.map(i => i.id)).toEqual(['b'])
    expect(review.own.map(i => i.id)).toEqual(['c'])
    expect(review.liveTotalCredits).toBe(20)
    expect(review.orderChanged).toBe(true)
  })

  it('never throws for a malformed trade with an empty received array (classified unavailable)', async () => {
    const emptyReceived = { signer: '0xseller', received: [] } as unknown as Trade
    const review = await reviewCart(
      [item('a', 20), item('b', 10)],
      BUYER,
      resolverFrom({ a: emptyReceived, b: trade(1) })
    )

    expect(review.unavailable.map(i => i.id)).toEqual(['a'])
    expect(review.buyable.map(l => l.item.id)).toEqual(['b'])
  })

  it('classifies a zero/malformed-price trade as unavailable (never buyable at 0 credits)', async () => {
    const zero = { signer: '0xseller', received: [{ amount: '0' }] } as unknown as Trade
    const review = await reviewCart([item('a', 20)], BUYER, resolverFrom({ a: zero }))

    expect(review.buyable).toEqual([])
    expect(review.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('returns an empty, unchanged review for an empty cart', async () => {
    const review = await reviewCart([], BUYER, resolverFrom({}))
    expect(review).toEqual({ buyable: [], unavailable: [], own: [], liveTotalCredits: 0, orderChanged: false })
  })

  it('multiplies a PRIMARY line by its quantity in the live total and carries quantity on the line', async () => {
    // A primary (mint) line with 3 copies: per-unit price stays, but the live total counts all 3.
    const items = [{ ...item('a', 20, { itemId: 'a', tokenId: undefined }), quantity: 3 }]
    const review = await reviewCart(items, BUYER, resolverFrom({ a: trade(2) }))

    expect(review.buyable[0].priceCredits).toBe(20) // per-unit
    expect(review.buyable[0].quantity).toBe(3)
    expect(review.liveTotalCredits).toBe(60) // 20 × 3
  })

  it('forces quantity 1 for a SECONDARY line even if a quantity was passed', async () => {
    const items = [{ ...item('a', 20, { tokenId: '7' }), quantity: 5 }]
    const review = await reviewCart(items, BUYER, resolverFrom({ a: trade(2) }))

    expect(review.buyable[0].quantity).toBe(1)
    expect(review.liveTotalCredits).toBe(20)
  })

  it('defaults quantity to 1 when a line carries none (backward-compat)', async () => {
    const review = await reviewCart([item('a', 20)], BUYER, resolverFrom({ a: trade(2) }))
    expect(review.buyable[0].quantity).toBe(1)
    expect(review.liveTotalCredits).toBe(20)
  })

  it('centsToCredits rounds up to whole credits', () => {
    expect(centsToCredits(200)).toBe(20)
    expect(centsToCredits(201)).toBe(21)
    expect(centsToCredits(1)).toBe(1)
    expect(centsToCredits(0)).toBe(0)
  })
})

/**
 * Legacy (plain-ERC20, MANA-priced) lines.
 *
 * The catalogue mixes two kinds of listing and only the trade says which. A native amount is USD wei; a
 * legacy amount is MANA wei. Reading one as the other does not produce a slightly-wrong price — it
 * produces a meaningless one, off by the MANA price. These pin that the branch is taken on `assetType`
 * and that a legacy line without a rate is deferred rather than mispriced.
 */
describe('reviewCart with legacy MANA lines', () => {
  it('prices a legacy line through the oracle rate, not as USD wei', async () => {
    const legacy = item('L', 50)
    const review = await reviewCart([legacy], BUYER, resolverFrom({ L: legacyTrade(10) }), RATE)

    // 10 MANA at $0.50 = $5 = 500 cents = 50 credits.
    expect(review.buyable).toHaveLength(1)
    expect(review.buyable[0].usdCents).toBe(500)
    expect(review.buyable[0].priceCredits).toBe(50)
    expect(review.liveTotalCredits).toBe(50)
  })

  it('would have mispriced that same line by reading the amount as dollars', async () => {
    // Guards the branch itself: 10 MANA is 1e19 wei, which read as USD wei is $10 — twice the real price.
    // If assetType were ignored the line above would come back at 100 credits instead of 50.
    const review = await reviewCart([item('L', 50)], BUYER, resolverFrom({ L: legacyTrade(10) }), RATE)

    expect(review.buyable[0].priceCredits).not.toBe(100)
  })

  it('defers a legacy line when no rate is available instead of guessing', async () => {
    // No rate → cannot price it honestly. Reporting "no longer available" is recoverable; charging the
    // wrong amount is not.
    const review = await reviewCart([item('L', 50)], BUYER, resolverFrom({ L: legacyTrade(10) }))

    expect(review.buyable).toHaveLength(0)
    expect(review.unavailable.map(i => i.id)).toEqual(['L'])
    expect(review.orderChanged).toBe(true)
  })

  it('still prices native lines from their own amount when a rate is passed', async () => {
    // The rate must not leak into the native branch: $2 stays $2 regardless of the MANA price.
    const review = await reviewCart([item('N', 20)], BUYER, resolverFrom({ N: trade(2) }), RATE)

    expect(review.buyable[0].usdCents).toBe(200)
    expect(review.buyable[0].priceCredits).toBe(20)
  })

  it('handles a MIXED basket, pricing each line by its own kind', async () => {
    const review = await reviewCart(
      [item('N', 20), item('L', 50)],
      BUYER,
      resolverFrom({ N: trade(2), L: legacyTrade(10) }),
      RATE
    )

    expect(review.buyable).toHaveLength(2)
    expect(review.liveTotalCredits).toBe(70) // 20 native + 50 legacy
  })

  it('drops a legacy line whose price rounds to nothing rather than authorizing $0', async () => {
    // A dust MANA amount at a low rate floors to 0 cents; a $0 authorize reverts on-chain.
    const review = await reviewCart([item('L', 1)], BUYER, resolverFrom({ L: legacyTrade(0) }), RATE)

    expect(review.buyable).toHaveLength(0)
    expect(review.unavailable.map(i => i.id)).toEqual(['L'])
  })
  /**
   * Pricing must FAIL CLOSED on an asset type it does not know. Both branches are matched explicitly, so a
   * type nobody has written a rule for yet — or a field missing after an API regression — cannot fall
   * through into the MANA oracle path and get priced as MANA. A wrong price here is not a display bug: it
   * is the number the buyer is charged.
   */
  it('defers an unknown price asset type instead of pricing it as MANA', async () => {
    const unknown = item('U', 50)
    // Deliberately not TradeAssetType.ERC20 or USD_PEGGED_MANA. 99 stands in for a type added later.
    const trade = {
      ...legacyTrade(10),
      received: [{ assetType: 99, amount: '10000000000000000000' }]
    } as unknown as Trade

    const review = await reviewCart([unknown], BUYER, resolverFrom({ U: trade }), RATE)

    expect(review.buyable).toHaveLength(0)
    expect(review.unavailable.map(i => i.id)).toEqual(['U'])
  })

  it('defers a price asset with no assetType at all rather than assuming the legacy shape', async () => {
    const trade = { ...legacyTrade(10), received: [{ amount: '10000000000000000000' }] } as unknown as Trade

    const review = await reviewCart([item('N', 50)], BUYER, resolverFrom({ N: trade }), RATE)

    expect(review.buyable).toHaveLength(0)
    expect(review.unavailable.map(i => i.id)).toEqual(['N'])
  })
})
