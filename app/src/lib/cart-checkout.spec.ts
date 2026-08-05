import { describe, it, expect } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'
import {
  reviewCart,
  centsToCredits,
  partitionReservations,
  type StoreResolver,
  type TradeResolver
} from '~/lib/cart-checkout'

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

/**
 * CollectionStore mints. These are the majority of the sellable catalogue and they are NOT trades: primary
 * minting has no order and nothing signed, so the line resolves down its own branch and settles through
 * CollectionStore.buy.
 *
 * The theme of these cases is that a mint has TWO facts nothing pins — its price and its remaining supply —
 * where a trade has a signature pinning the price. So both must be re-read at review, and every way that read
 * can come back unusable has to land the line in `unavailable` rather than in a charge.
 */
describe('reviewCart with CollectionStore mints', () => {
  const mint = (id: string, priceCredits: number, over: Partial<CatalogItem> = {}) =>
    item(id, priceCredits, { acquisition: 'store', tradeId: undefined, ...over })

  // 10 MANA at $0.50 = $5.00 = 50 credits, matching RATE above.
  const TEN_MANA = (10n * 10n ** 18n).toString()

  const storeResolver =
    (map: Record<string, { priceWei: string; available: number } | null | 'throw'>): StoreResolver =>
    async i => {
      const r = map[i.id]
      if (r === 'throw') throw new Error('store read failed')
      return r ?? null
    }

  // No trade resolver should ever be consulted for a mint; this one fails loudly if it is.
  const neverResolveTrade: TradeResolver = async () => {
    throw new Error('the trade resolver must not be called for a mint')
  }

  it('should price a mint from its LIVE mana price, not the cart snapshot', async () => {
    // The cart stored 999 credits; the live read says 10 MANA = 50 credits. The live number must win.
    const rev = await reviewCart(
      [mint('a', 999)],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: TEN_MANA, available: 5 } })
    )

    expect(rev.buyable).toHaveLength(1)
    expect(rev.buyable[0].priceCredits).toBe(50)
    expect(rev.buyable[0].usdCents).toBe(500)
    expect(rev.orderChanged).toBe(true)
  })

  it('should carry the live price as priceWei, which is what the contract re-validates', async () => {
    const rev = await reviewCart(
      [mint('a', 50)],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: TEN_MANA, available: 1 } })
    )

    const line = rev.buyable[0]
    expect(line.acquisition).toBe('store')
    // CollectionStore.buy takes the price as an argument and reverts if it does not match the live chain
    // price, so the exact wei the review read has to reach the calldata untouched.
    if (line.acquisition === 'store') expect(line.priceWei).toBe(TEN_MANA)
  })

  it('should never treat a mint as a trade', async () => {
    // neverResolveTrade throws; a mint routed down the trade branch would surface as `unavailable` via the
    // catch, so a green `buyable` here is the proof the branch is taken on `acquisition`.
    const rev = await reviewCart(
      [mint('a', 50)],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: TEN_MANA, available: 1 } })
    )

    expect(rev.buyable).toHaveLength(1)
    expect(rev.unavailable).toHaveLength(0)
  })

  it('should drop a mint that sold out between browsing and checkout', async () => {
    const rev = await reviewCart(
      [mint('a', 50)],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: TEN_MANA, available: 0 } })
    )

    // Supply is finite and shrinks as others mint. Dropping it here beats reverting on-chain after the
    // buyer has paid gas.
    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint whose remaining supply is short of the requested quantity', async () => {
    const rev = await reviewCart(
      [{ ...mint('a', 50), quantity: 3 }],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: TEN_MANA, available: 2 } })
    )

    // Buying 3 of 2 remaining reverts for the WHOLE batch, so the line is unbuyable rather than silently
    // reduced to 2 — a quantity the buyer never asked for is its own kind of wrong charge.
    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint that is no longer mintable', async () => {
    const rev = await reviewCart([mint('a', 50)], BUYER, neverResolveTrade, RATE, storeResolver({ a: null }))

    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint when the live read fails rather than charging the snapshot', async () => {
    const rev = await reviewCart([mint('a', 50)], BUYER, neverResolveTrade, RATE, storeResolver({ a: 'throw' }))

    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint when no store resolver is wired', async () => {
    // Fail closed: a caller that has not wired the store path must not charge a mint off the cart snapshot.
    const rev = await reviewCart([mint('a', 50)], BUYER, neverResolveTrade, RATE)

    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint when there is no rate to price its mana with', async () => {
    const rev = await reviewCart(
      [mint('a', 50)],
      BUYER,
      neverResolveTrade,
      undefined,
      storeResolver({ a: { priceWei: TEN_MANA, available: 1 } })
    )

    // Same fail-closed choice legacy trades already make: "no longer available" is recoverable, charging a
    // guessed amount is not.
    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id)).toEqual(['a'])
  })

  it('should drop a mint whose live price is zero or unparseable', async () => {
    const rev = await reviewCart(
      [mint('a', 50), mint('b', 50)],
      BUYER,
      neverResolveTrade,
      RATE,
      storeResolver({ a: { priceWei: '0', available: 1 }, b: { priceWei: 'not-a-number', available: 1 } })
    )

    // A zero-priced line would authorize a $0 credit and revert; a NaN one would authorize nonsense.
    expect(rev.buyable).toHaveLength(0)
    expect(rev.unavailable.map(i => i.id).sort()).toEqual(['a', 'b'])
  })

  it('should treat a cart line saved before mints existed as a trade', async () => {
    // Persisted carts carry no `acquisition`, and every one of those rows is a trade. Defaulting the other
    // way would route real trades down the mint path.
    const legacyCartItem = item('a', 20)
    expect(legacyCartItem.acquisition).toBeUndefined()

    const rev = await reviewCart([legacyCartItem], BUYER, resolverFrom({ a: trade(2) }), RATE)

    expect(rev.buyable).toHaveLength(1)
    expect(rev.buyable[0].acquisition).toBe('trade')
  })

  it('should resolve a MIXED basket down both branches at once', async () => {
    const rev = await reviewCart(
      [item('t', 20), mint('s', 50)],
      BUYER,
      resolverFrom({ t: trade(2) }),
      RATE,
      storeResolver({ s: { priceWei: TEN_MANA, available: 1 } })
    )

    expect(rev.buyable).toHaveLength(2)
    expect(rev.buyable.map(l => l.acquisition)).toEqual(['trade', 'store'])
    expect(rev.liveTotalCredits).toBe(70)
  })

  it('should keep the rest of a mixed basket buyable when the mint drops out', async () => {
    const rev = await reviewCart(
      [item('t', 20), mint('s', 50)],
      BUYER,
      resolverFrom({ t: trade(2) }),
      RATE,
      storeResolver({ s: null })
    )

    // One bad row must never abort the basket.
    expect(rev.buyable.map(l => l.item.id)).toEqual(['t'])
    expect(rev.unavailable.map(i => i.id)).toEqual(['s'])
  })
})

/**
 * Splitting a failed checkout's reservations.
 *
 * These exist because the first version of this logic shipped BROKEN in a way nothing could see: the salt →
 * item map was declared and read but never populated, so the bought-items half silently did nothing. `tsc` is
 * happy with a Map that is only read, and every test at the time was one layer below, on
 * `buyManyWithCredits`. Pulling the decision out of the page component is what makes it observable.
 */
describe('when splitting a failed checkout into what to release and what was bought', () => {
  const res = (salt: string, itemId: string) => ({ salt, itemId })

  it('should keep spent reservations and release only the rest', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a'), res('salt-b', 'item-b')],
      spent: new Set(['salt-a']),
      settled: new Set(['salt-a'])
    })

    // salt-a is spent for good — releasing it is the money bug this whole change exists for.
    expect(result.toRelease).toEqual(['salt-b'])
    expect(result.boughtItemIds).toEqual(['item-a'])
  })

  it('should release everything when nothing went out', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a'), res('salt-b', 'item-b')],
      spent: new Set(),
      settled: new Set()
    })

    expect(result.toRelease).toEqual(['salt-a', 'salt-b'])
    expect(result.boughtItemIds).toEqual([])
  })

  it('should release nothing when the whole basket went out', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a'), res('salt-b', 'item-b')],
      spent: new Set(['salt-a', 'salt-b']),
      settled: new Set(['salt-a', 'salt-b'])
    })

    expect(result.toRelease).toEqual([])
    expect(result.boughtItemIds).toEqual(['item-a', 'item-b'])
  })

  /**
   * THE CASE A SINGLE `broadcast` SET CANNOT EXPRESS, and the one the first version of this got wrong.
   *
   * A transaction that mined and reverted was broadcast, but it rolled back: no credit was consumed and the
   * buyer owns nothing. The caller reports it as neither spent nor settled, so the reservation goes back into
   * `toRelease` (instead of being stranded until the TTL) and the line stays in the cart (instead of being
   * removed from the cart of someone who bought nothing).
   */
  it('should release a reverted group and leave its lines in the cart', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a'), res('salt-b', 'item-b')],
      // salt-a settled; salt-b was broadcast and reverted, so the caller left it out of `spent`.
      spent: new Set(['salt-a']),
      settled: new Set(['salt-a'])
    })

    expect(result.toRelease).toEqual(['salt-b'])
    expect(result.boughtItemIds).toEqual(['item-a'])
  })

  // In flight, outcome unknown (timeout, dropped socket, replaced transaction): it may yet be consumed, so it
  // must NOT be released — but it is not owned either, so its line stays. Both halves differ here, which is
  // exactly why they are separate inputs.
  it('should neither release nor claim a group whose outcome is unknown', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a')],
      spent: new Set(['salt-a']),
      settled: new Set()
    })

    expect(result.toRelease).toEqual([])
    expect(result.boughtItemIds).toEqual([])
  })

  // A quantity-2 line reserves two salts but is ONE cart row, so removing it twice would be wrong.
  it('should name a multi-unit line once', () => {
    const result = partitionReservations({
      reservations: [res('salt-a1', 'item-a'), res('salt-a2', 'item-a')],
      spent: new Set(['salt-a1', 'salt-a2']),
      settled: new Set(['salt-a1', 'salt-a2'])
    })

    expect(result.boughtItemIds).toEqual(['item-a'])
  })

  // A group reports every salt in its transaction; a salt this checkout never reserved cannot name a cart line
  // and must not turn into an `undefined` the caller then tries to remove.
  it('should ignore a settled salt that is not one of its reservations', () => {
    const result = partitionReservations({
      reservations: [res('salt-a', 'item-a')],
      spent: new Set(['salt-a', 'salt-unknown']),
      settled: new Set(['salt-a', 'salt-unknown'])
    })

    expect(result.boughtItemIds).toEqual(['item-a'])
  })

  /**
   * NOT TESTED, because the type no longer allows it: the original bug was a salt with no line, and a
   * `Reservation` cannot exist without both. The test that used to guard it ("bought items must be empty when
   * the map is empty") only had something to assert while the two halves were separate structures the caller
   * had to keep in step by hand. Deleting that possibility is a better guarantee than asserting on it.
   */
})
