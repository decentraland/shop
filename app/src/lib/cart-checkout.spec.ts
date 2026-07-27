import { describe, it, expect } from 'vitest'
import type { Trade } from '@dcl/schemas'
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

// A USD-pegged trade priced at `dollars`, signed by `signer` (the seller). received amount is USD wei
// (1e18 = $1), so $2 → 2e18 wei → 200 cents → 20 credits.
const trade = (dollars: number, signer = '0xseller'): Trade =>
  ({ signer, received: [{ amount: (BigInt(Math.round(dollars * 100)) * 10n ** 16n).toString() }] }) as unknown as Trade

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
