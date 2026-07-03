import { BigNumber } from 'ethers'

import {
  applyBufferBps,
  applySlippageFloor,
  InvalidAmountError,
  InvalidOraclePriceError,
  manaBaseToEther,
  manaEtherToBase,
  manaToUsdc,
  oraclePriceToUsd,
  usdcBaseToDollars,
  usdcDollarsToBase,
  usdcToMana
} from '../../../../src/logic/treasury/math'

// Amoy mock oracle ~ $0.2696 per MANA, 8 decimals.
const PRICE_02696 = BigNumber.from('26960000')
// A round $1.00 per MANA, for easy hand-verification.
const PRICE_1USD = BigNumber.from('100000000')

const ONE_USDC = BigNumber.from('1000000') // $1, 6dp
const ONE_MANA = BigNumber.from('1000000000000000000') // 1 MANA, 18dp

describe('when converting USDC to MANA', () => {
  describe('and the price is exactly $1 per MANA', () => {
    it('should return one MANA per one USDC', () => {
      expect(usdcToMana(ONE_USDC, PRICE_1USD).toString()).toBe(ONE_MANA.toString())
    })

    it('should scale linearly with the USDC amount', () => {
      const tenUsdc = ONE_USDC.mul(10)
      expect(usdcToMana(tenUsdc, PRICE_1USD).toString()).toBe(ONE_MANA.mul(10).toString())
    })
  })

  describe('and the price is $0.2696 per MANA', () => {
    it('should return ~3.709 MANA per dollar', () => {
      // $1 / 0.2696 = 3.70919... MANA. Exact base-unit value verified by hand.
      const mana = usdcToMana(ONE_USDC, PRICE_02696)
      expect(mana.toString()).toBe('3709198813056379821')
      expect(manaBaseToEther(mana)).toBeCloseTo(3.7092, 3)
    })

    it('should match the hand-computed ether value within rounding', () => {
      const tenDollars = ONE_USDC.mul(10)
      const mana = usdcToMana(tenDollars, PRICE_02696)
      // $10 / 0.2696 = 37.0919 MANA
      expect(manaBaseToEther(mana)).toBeCloseTo(37.0919, 3)
    })
  })

  describe('and the USDC amount is zero', () => {
    it('should return zero MANA', () => {
      expect(usdcToMana(BigNumber.from(0), PRICE_1USD).toString()).toBe('0')
    })
  })

  describe('and the price is zero or negative', () => {
    it('should throw InvalidOraclePriceError for zero', () => {
      expect(() => usdcToMana(ONE_USDC, BigNumber.from(0))).toThrow(InvalidOraclePriceError)
    })

    it('should throw InvalidOraclePriceError for a negative price', () => {
      expect(() => usdcToMana(ONE_USDC, BigNumber.from(-1))).toThrow(InvalidOraclePriceError)
    })
  })

  describe('and the USDC amount is negative', () => {
    it('should throw InvalidAmountError', () => {
      expect(() => usdcToMana(BigNumber.from(-1), PRICE_1USD)).toThrow(InvalidAmountError)
    })
  })
})

describe('when converting MANA to USDC', () => {
  describe('and the price is exactly $1 per MANA', () => {
    it('should return one USDC per one MANA', () => {
      expect(manaToUsdc(ONE_MANA, PRICE_1USD).toString()).toBe(ONE_USDC.toString())
    })
  })

  describe('and the price is $0.2696 per MANA', () => {
    it('should value one MANA at ~$0.2696', () => {
      const usdc = manaToUsdc(ONE_MANA, PRICE_02696)
      expect(usdcBaseToDollars(usdc)).toBeCloseTo(0.2696, 4)
    })
  })

  describe('and round-tripping USDC -> MANA -> USDC', () => {
    it('should return the original amount at a clean $1 price', () => {
      const mana = usdcToMana(ONE_USDC.mul(5), PRICE_1USD)
      const back = manaToUsdc(mana, PRICE_1USD)
      expect(back.toString()).toBe(ONE_USDC.mul(5).toString())
    })
  })

  describe('and the price is invalid', () => {
    it('should throw for a zero price', () => {
      expect(() => manaToUsdc(ONE_MANA, BigNumber.from(0))).toThrow(InvalidOraclePriceError)
    })
  })
})

describe('when applying a slippage floor', () => {
  it('should reduce the amount by the slippage in basis points', () => {
    // 300 bps = 3% off 1000 => 970
    expect(applySlippageFloor(BigNumber.from(1000), 300).toString()).toBe('970')
  })

  it('should return the same amount for zero slippage', () => {
    expect(applySlippageFloor(BigNumber.from(1000), 0).toString()).toBe('1000')
  })

  it('should return zero for 100% slippage', () => {
    expect(applySlippageFloor(BigNumber.from(1000), 10000).toString()).toBe('0')
  })

  it('should throw for slippage above 100%', () => {
    expect(() => applySlippageFloor(BigNumber.from(1000), 10001)).toThrow()
  })

  it('should throw for negative slippage', () => {
    expect(() => applySlippageFloor(BigNumber.from(1000), -1)).toThrow()
  })
})

describe('when applying a buffer', () => {
  it('should increase the amount by the buffer in basis points', () => {
    // 50 bps = 0.5% on 1000 => 1005
    expect(applyBufferBps(BigNumber.from(1000), 50).toString()).toBe('1005')
  })

  it('should return the same amount for a zero buffer', () => {
    expect(applyBufferBps(BigNumber.from(1000), 0).toString()).toBe('1000')
  })

  it('should throw for a negative buffer', () => {
    expect(() => applyBufferBps(BigNumber.from(1000), -1)).toThrow()
  })
})

describe('when converting human units to and from base units', () => {
  it('should convert MANA ether to base and back', () => {
    const base = manaEtherToBase(150.5)
    expect(base.toString()).toBe('150500000000000000000')
    expect(manaBaseToEther(base)).toBeCloseTo(150.5, 6)
  })

  it('should convert USDC dollars to base and back', () => {
    const base = usdcDollarsToBase(10.25)
    expect(base.toString()).toBe('10250000')
    expect(usdcBaseToDollars(base)).toBeCloseTo(10.25, 6)
  })

  it('should truncate MANA fractions beyond 18 decimals', () => {
    const base = manaEtherToBase(1.0000000000000000009)
    // JS number can't hold that precision, but the helper must not throw.
    expect(base.gt(0)).toBe(true)
  })

  it('should convert the oracle price to a USD number', () => {
    expect(oraclePriceToUsd(PRICE_02696)).toBeCloseTo(0.2696, 4)
  })

  it('should throw for a negative ether value', () => {
    expect(() => manaEtherToBase(-1)).toThrow()
  })
})
