import { describe, it, expect } from 'vitest'
import { usdCentsToCredits } from '~/lib/currency'
import {
  computePaymentOptions,
  distributeCreditsAcrossUnits,
  findOption,
  hasPayableOption,
  manaForRemainder
} from '~/lib/payment-options'

// 1 credit = 10 cents. A 100-credit item costs 1000 cents.
const PRICE_CENTS = 1000
// …and 500 MANA at the rate used in these fixtures (so 1 cent = 0.5 MANA).
const PRICE_MANA = 500n * 10n ** 18n
const mana = (whole: number) => BigInt(whole) * 10n ** 18n

function opts(over: Partial<Parameters<typeof computePaymentOptions>[0]> = {}) {
  return computePaymentOptions({
    priceCents: PRICE_CENTS,
    priceManaWei: PRICE_MANA,
    balanceCents: 0,
    manaBalanceWei: 0n,
    ...over
  })
}
const methods = (o: ReturnType<typeof computePaymentOptions>) => o.options.map(x => x.method)

describe('computePaymentOptions', () => {
  describe('when the buyer holds no MANA', () => {
    it('should offer only the credits rail when credits cover the price', () => {
      const o = opts({ balanceCents: PRICE_CENTS })
      expect(methods(o)).toEqual(['credits'])
      expect(o.preferred).toBe('credits')
      expect(findOption(o, 'credits')).toEqual({
        method: 'credits',
        creditsCents: PRICE_CENTS,
        credits: PRICE_CENTS / 10,
        manaWei: 0n
      })
    })

    it('should offer nothing when credits fall short (caller falls back to the top-up flow)', () => {
      const o = opts({ balanceCents: PRICE_CENTS - 1 })
      expect(o.options).toEqual([])
      expect(o.preferred).toBeNull()
      expect(hasPayableOption(o)).toBe(false)
    })
  })

  describe('when the buyer holds MANA but no credits', () => {
    it('should offer only the MANA rail when MANA covers the price', () => {
      const o = opts({ manaBalanceWei: PRICE_MANA })
      expect(methods(o)).toEqual(['mana'])
      expect(o.preferred).toBe('mana')
      expect(findOption(o, 'mana')).toEqual({ method: 'mana', creditsCents: 0, credits: 0, manaWei: PRICE_MANA })
    })

    it('should offer nothing when the MANA balance is one wei short', () => {
      const o = opts({ manaBalanceWei: PRICE_MANA - 1n })
      expect(o.options).toEqual([])
      expect(o.preferred).toBeNull()
    })

    it('should NOT offer the combined rail (there are no credits to spend first)', () => {
      const o = opts({ balanceCents: 0, manaBalanceWei: PRICE_MANA })
      expect(methods(o)).not.toContain('combined')
    })
  })

  describe('when the buyer holds partial credits plus MANA', () => {
    it('should offer the combined rail with credits first and MANA for the exact remainder', () => {
      // 400 of 1000 cents in credits → 600 cents remain → 600/1000 × 500 MANA = 300 MANA. The balance
      // (400 MANA) covers that remainder but NOT the full 500-MANA price, so combined is the only rail.
      const o = opts({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(methods(o)).toEqual(['combined'])
      expect(findOption(o, 'combined')).toEqual({
        method: 'combined',
        creditsCents: 400,
        credits: 40,
        manaWei: mana(300)
      })
      expect(o.preferred).toBe('combined')
    })

    it('should offer combined when the MANA balance covers the remainder EXACTLY', () => {
      const o = opts({ balanceCents: 400, manaBalanceWei: mana(300) })
      expect(methods(o)).toContain('combined')
    })

    it('should NOT offer combined when the MANA balance is one wei short of the remainder', () => {
      const o = opts({ balanceCents: 400, manaBalanceWei: mana(300) - 1n })
      expect(methods(o)).not.toContain('combined')
      expect(o.options).toEqual([])
    })

    it('should offer combined AND mana when the MANA balance also covers the whole price', () => {
      const o = opts({ balanceCents: 400, manaBalanceWei: PRICE_MANA })
      expect(methods(o)).toEqual(['combined', 'mana'])
      // Combined is preferred: it spends the credits the buyer already holds first.
      expect(o.preferred).toBe('combined')
    })
  })

  describe('when the buyer holds enough of both', () => {
    it('should offer credits and mana but NOT combined (a full credit balance leaves no remainder)', () => {
      const o = opts({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(methods(o)).toEqual(['credits', 'mana'])
      expect(methods(o)).not.toContain('combined')
      expect(o.preferred).toBe('credits')
    })

    it('should keep the display order credits → combined → mana', () => {
      // Credits short by 1 cent so all three could theoretically apply; combined + mana are offered.
      const o = opts({ balanceCents: PRICE_CENTS - 10, manaBalanceWei: PRICE_MANA })
      expect(methods(o)).toEqual(['combined', 'mana'])
    })
  })

  describe('when the MANA price is unknown (oracle read failed)', () => {
    it('should offer only the credits rail, never a MANA one', () => {
      const o = opts({ priceManaWei: 0n, balanceCents: PRICE_CENTS, manaBalanceWei: mana(10_000) })
      expect(methods(o)).toEqual(['credits'])
    })

    it('should offer nothing when credits are also short', () => {
      const o = opts({ priceManaWei: 0n, balanceCents: 500, manaBalanceWei: mana(10_000) })
      expect(o.options).toEqual([])
    })
  })

  describe('guards', () => {
    it('should offer nothing for a zero or negative price', () => {
      expect(opts({ priceCents: 0, balanceCents: 5000 }).options).toEqual([])
      expect(opts({ priceCents: -100, balanceCents: 5000 }).options).toEqual([])
    })

    it('should treat a negative MANA balance as zero', () => {
      const o = opts({ balanceCents: PRICE_CENTS, manaBalanceWei: -5n })
      expect(methods(o)).toEqual(['credits'])
    })

    it('should truncate fractional cent inputs instead of drifting', () => {
      // 999.9 cents of balance against a 1000-cent price is still short.
      const o = opts({ balanceCents: 999.9 })
      expect(o.options).toEqual([])
      // …and a fractional price truncates to 1000, which a 1000-cent balance covers.
      expect(methods(opts({ priceCents: 1000.7, balanceCents: 1000 }))).toEqual(['credits'])
    })

    it('should treat NaN balances as zero rather than throwing', () => {
      const o = opts({ balanceCents: Number.NaN, manaBalanceWei: PRICE_MANA })
      expect(methods(o)).toEqual(['mana'])
    })
  })

  describe('the combined split never under-funds the price', () => {
    it('should round the MANA leg UP when the remainder does not divide evenly', () => {
      // 1 cent of 3 remains → 1/3 of 1 wei rounds up to 1 wei (never 0).
      expect(manaForRemainder(1, 3, 1n)).toBe(1n)
      // 7 of 999 cents against an odd MANA price: ceil, not floor.
      const exact = (7n * 1_000_000_000_000_001n) / 999n
      expect(manaForRemainder(7, 999, 1_000_000_000_000_001n)).toBe(exact + 1n)
    })

    it('should cover credits + MANA >= the price for every partial balance', () => {
      // Sweep every 10-cent step of a partial balance: the two legs must always sum to the full price.
      for (let bal = 10; bal < PRICE_CENTS; bal += 10) {
        const o = opts({ balanceCents: bal, manaBalanceWei: PRICE_MANA })
        const combined = findOption(o, 'combined')
        expect(combined, `balance ${bal}`).not.toBeNull()
        const manaLegCents = (combined!.manaWei * BigInt(PRICE_CENTS)) / PRICE_MANA
        expect(BigInt(combined!.creditsCents) + manaLegCents).toBeGreaterThanOrEqual(BigInt(PRICE_CENTS))
      }
    })

    it('should return the whole MANA price when the remainder is the whole price', () => {
      expect(manaForRemainder(PRICE_CENTS, PRICE_CENTS, PRICE_MANA)).toBe(PRICE_MANA)
      expect(manaForRemainder(PRICE_CENTS + 50, PRICE_CENTS, PRICE_MANA)).toBe(PRICE_MANA)
    })

    it('should return zero MANA for a non-positive remainder or price', () => {
      expect(manaForRemainder(0, PRICE_CENTS, PRICE_MANA)).toBe(0n)
      expect(manaForRemainder(-5, PRICE_CENTS, PRICE_MANA)).toBe(0n)
      expect(manaForRemainder(100, 0, PRICE_MANA)).toBe(0n)
    })
  })

  describe('findOption', () => {
    it('should return null for a method that is not offerable', () => {
      const o = opts({ balanceCents: PRICE_CENTS })
      expect(findOption(o, 'mana')).toBeNull()
      expect(findOption(o, 'combined')).toBeNull()
      expect(findOption(o, 'credits')).not.toBeNull()
    })
  })
})

describe('distributeCreditsAcrossUnits (combined payment across a cart)', () => {
  it('should fully fund every unit when the balance covers the basket', () => {
    expect(distributeCreditsAcrossUnits([300, 500, 200], 1000)).toEqual([300, 500, 200])
  })

  it('should fund units in order and leave a PARTIAL credit on the unit that exhausts the balance', () => {
    // 650 of a 1000-cent basket: 300 (full) + 350 (partial, of 500) + 0 (MANA covers it).
    expect(distributeCreditsAcrossUnits([300, 500, 200], 650)).toEqual([300, 350, 0])
  })

  it('should give every unit zero when there is no credit balance (a MANA-only basket)', () => {
    expect(distributeCreditsAcrossUnits([300, 500], 0)).toEqual([0, 0])
  })

  it('should never allocate more than the basket costs, even with a huge balance', () => {
    const alloc = distributeCreditsAcrossUnits([300, 500], 999_999)
    expect(alloc).toEqual([300, 500])
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(800)
  })

  it('should sum to min(balance, basket) so the caller can derive the MANA gap', () => {
    const units = [120, 340, 55, 900]
    const basket = units.reduce((a, b) => a + b, 0)
    for (const balance of [0, 1, 119, 120, 121, 460, basket - 1, basket, basket + 500]) {
      const total = distributeCreditsAcrossUnits(units, balance).reduce((a, b) => a + b, 0)
      expect(total, `balance ${balance}`).toBe(Math.min(balance, basket))
    }
  })

  it('should never allocate more to a unit than that unit costs', () => {
    const units = [100, 20, 5]
    distributeCreditsAcrossUnits(units, 1000).forEach((take, i) => expect(take).toBeLessThanOrEqual(units[i]))
  })

  it('should coerce junk inputs instead of drifting', () => {
    expect(distributeCreditsAcrossUnits([100.7, -5, Number.NaN], 1000)).toEqual([100, 0, 0])
    expect(distributeCreditsAcrossUnits([100], Number.NaN)).toEqual([0])
    expect(distributeCreditsAcrossUnits([100], -50)).toEqual([0])
  })

  it('should return an empty allocation for an empty cart', () => {
    expect(distributeCreditsAcrossUnits([], 500)).toEqual([])
  })
})

describe('manaShortfall — held MANA that cannot pay', () => {
  // $10.00 item, and the buyer's MANA is worth $2.00 at this purchase's rate (5 MANA of a needed 25).
  const price = { priceCents: 1000, priceManaWei: 25n * 10n ** 18n }

  it('reports what the balance is worth when MANA alone falls short and there are no credits', () => {
    const o = computePaymentOptions({ ...price, balanceCents: 0, manaBalanceWei: 5n * 10n ** 18n })
    expect(o.options).toEqual([])
    expect(o.manaShortfall).toEqual({ manaWei: 5n * 10n ** 18n, manaCents: 200, priceCents: 1000 })
  })

  it('reports it when credits + MANA together still fall short', () => {
    // $3 of credits + $2 of MANA = $5 against a $10 price: no rail, and the buyer needs to know why.
    const o = computePaymentOptions({ ...price, balanceCents: 300, manaBalanceWei: 5n * 10n ** 18n })
    expect(o.options).toEqual([])
    expect(o.manaShortfall?.manaCents).toBe(200)
  })

  it('is null when a MANA rail IS offerable — the enabled button is the explanation', () => {
    expect(
      computePaymentOptions({ ...price, balanceCents: 0, manaBalanceWei: 25n * 10n ** 18n }).manaShortfall
    ).toBeNull()
    // Combined: $9 of credits leaves a $1 remainder that 2.5 MANA covers.
    expect(
      computePaymentOptions({ ...price, balanceCents: 900, manaBalanceWei: 3n * 10n ** 18n }).manaShortfall
    ).toBeNull()
  })

  it('is null when the buyer holds no MANA, and when the rate is unknown', () => {
    expect(computePaymentOptions({ ...price, balanceCents: 0, manaBalanceWei: 0n }).manaShortfall).toBeNull()
    expect(
      computePaymentOptions({ priceCents: 1000, priceManaWei: 0n, balanceCents: 0, manaBalanceWei: 5n * 10n ** 18n })
        .manaShortfall
    ).toBeNull()
  })

  it('reports it alongside a payable credits rail', () => {
    // Credits cover the price, so the purchase is not blocked — but the buyer still holds MANA that
    // isn't being offered, and "I have MANA, why is there no MANA button?" needs an answer whether or
    // not they can pay another way.
    const o = computePaymentOptions({ ...price, balanceCents: 1000, manaBalanceWei: 1n * 10n ** 18n })
    expect(o.options.map(x => x.method)).toEqual(['credits'])
    expect(o.manaShortfall?.manaCents).toBe(40)
  })

  it('floors the worth so a stated value is always actually covered', () => {
    // 1 wei short of $2.00 worth must not round up to 200 cents.
    const o = computePaymentOptions({ ...price, balanceCents: 0, manaBalanceWei: 5n * 10n ** 18n - 1n })
    expect(o.manaShortfall?.manaCents).toBe(199)
  })
})

/**
 * The bug this exists for: the price line and the button under it disagreed about the SAME item.
 *
 * A 30 MANA legacy listing converts to 20.13 credits. The price line ceiled it to 21 (the shop charges
 * whole credits); the credits button divided plainly and printed 20.1 — a quantity nobody can hold or
 * spend. Two functions, both correct on their own terms, and nothing compared them.
 *
 * These pin the agreement rather than either rounding rule, because agreement is what broke.
 */
describe('what the buyer is shown', () => {
  it('should quote the credits rail at the same figure as the item price', () => {
    // 201 cents = the 30 MANA listing at the rate in the report.
    const o = computePaymentOptions({ priceCents: 201, priceManaWei: 0n, balanceCents: 100_000, manaBalanceWei: 0n })

    expect(findOption(o, 'credits')?.credits).toBe(usdCentsToCredits(201))
    expect(findOption(o, 'credits')?.credits).toBe(21)
  })

  it('should never quote a fraction of a credit', () => {
    for (const cents of [1, 7, 201, 999, 1234]) {
      const o = computePaymentOptions({
        priceCents: cents,
        priceManaWei: 0n,
        balanceCents: 1_000_000,
        manaBalanceWei: 0n
      })

      expect(Number.isInteger(findOption(o, 'credits')?.credits ?? 0)).toBe(true)
    }
  })

  /**
   * The mixed rail's cents are a BALANCE, not a price, so it rounds the other way. Ceiling here would
   * offer a credit the buyer does not hold — the same class of lie, pointing the other direction.
   */
  it('should floor the mixed rail, because that figure is what the buyer holds', () => {
    const o = computePaymentOptions({
      priceCents: 1000,
      priceManaWei: mana(100),
      balanceCents: 407,
      manaBalanceWei: mana(1000)
    })

    expect(findOption(o, 'combined')?.credits).toBe(40)
  })
})
