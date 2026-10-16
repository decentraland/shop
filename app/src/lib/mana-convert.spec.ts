import { describe, expect, it } from 'vitest'
import { listManaWeiFromSale, livePrices, type ManaRate } from '~/lib/mana-convert'

// $0.09 per MANA at 8 decimals.
const RATE: ManaRate = { rate: 9_000_000n, decimals: 8 }
const MANA = 10n ** 18n

// What the coupon contract charges for a list amount: price - floor(price * ppm / 1e6).
const contractSale = (list: bigint, ppm: number) => list - (list * BigInt(ppm)) / 1_000_000n

describe('when recovering the MANA list price behind a sale amount', () => {
  it.each([
    [100n * MANA, 300_000],
    [10n * MANA + 2n, 300_000],
    [999_999_999_999_999_999n, 50_000],
    [123_456_789_012_345_678_901n, 700_000],
    [7n, 300_000],
    [8n, 700_000],
    [10n, 900_000],
    [3n, 990_000],
    [1n, 500_000]
  ])('should land on a list amount that sells for the same sale amount (%s at %s ppm)', (list, ppm) => {
    const sale = contractSale(list, ppm)

    const recovered = BigInt(listManaWeiFromSale(sale.toString(), ppm)!)

    expect(contractSale(recovered, ppm)).toBe(sale)
    expect(recovered).toBeLessThanOrEqual(list)
    // The smallest: one wei less already sells for less.
    if (recovered > 0n) expect(contractSale(recovered - 1n, ppm)).toBeLessThan(sale)
  })

  it.each([0, -1, 1_000_000, 1.5])('should refuse a discount of %s ppm', ppm => {
    expect(listManaWeiFromSale('1000', ppm)).toBeNull()
  })

  it('should drop the struck-through price when the live rate pushes it to the sale price', () => {
    // A one-wei sale converts to the same credit as its list amount, so there is no visible discount left.
    expect(
      livePrices(
        { manaWei: '1', priceCredits: 1, compareAtCredits: 2, coupon: { discountType: 1, discount: 300_000 } },
        RATE
      )
    ).toMatchObject({
      compareAtCredits: undefined
    })
  })

  it('should refuse an amount that is not a whole number of wei', () => {
    expect(listManaWeiFromSale('1.5', 300_000)).toBeNull()
  })
})

describe('when pricing a row at the live rate', () => {
  const coupon = { discountType: 1, discount: 300_000 }

  it('should pass a USD-quoted row through untouched', () => {
    expect(livePrices({ priceCredits: 7, compareAtCredits: 10, coupon }, RATE)).toEqual({
      priceCredits: 7,
      compareAtCredits: 10
    })
  })

  // 70 MANA at $0.09 is $6.30 = 63 credits; the 100 MANA list behind it is $9.00 = 90 credits.
  it('should re-price a discounted MANA row and its struck-through price at the same rate', () => {
    expect(
      livePrices({ manaWei: (70n * MANA).toString(), priceCredits: 1, compareAtCredits: 2, coupon }, RATE)
    ).toEqual({ priceCredits: 63, compareAtCredits: 90 })
  })

  it('should keep the sale a sale when the live rate moved further than the discount', () => {
    // The server priced this at a rate under half the live one: its compare-at alone would sit below the sale.
    expect(
      livePrices({ manaWei: (70n * MANA).toString(), priceCredits: 30, compareAtCredits: 40, coupon }, RATE)
    ).toMatchObject({ priceCredits: 63, compareAtCredits: 90 })
  })

  it('should leave a MANA row that is not on sale without a compare-at', () => {
    expect(livePrices({ manaWei: (100n * MANA).toString(), priceCredits: 1 }, RATE)).toEqual({
      priceCredits: 90,
      compareAtCredits: undefined
    })
  })

  it('should not invent a strike-through for a flat-amount coupon it cannot invert', () => {
    expect(
      livePrices(
        {
          manaWei: (70n * MANA).toString(),
          priceCredits: 1,
          compareAtCredits: 2,
          coupon: { discountType: 2, discount: 5 }
        },
        RATE
      )
    ).toEqual({ priceCredits: 63, compareAtCredits: 2 })
  })
})
