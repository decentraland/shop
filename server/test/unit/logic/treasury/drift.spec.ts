import { BigNumber } from 'ethers'

import { computeDrift } from '../../../../src/logic/treasury/reconcile/drift'

describe('when computing reconciliation drift', () => {
  describe('and expected equals actual', () => {
    it('should report zero drift within tolerance', () => {
      const result = computeDrift(BigNumber.from(1000), BigNumber.from(1000), 200)
      expect(result.driftBps).toBe(0)
      expect(result.withinTolerance).toBe(true)
    })
  })

  describe('and actual is slightly below expected within tolerance', () => {
    it('should be within tolerance', () => {
      // 1% drift with 2% tolerance
      const result = computeDrift(BigNumber.from(10000), BigNumber.from(9900), 200)
      expect(result.driftBps).toBe(100)
      expect(result.withinTolerance).toBe(true)
    })
  })

  describe('and actual drift is exactly at the tolerance', () => {
    it('should be within tolerance (inclusive)', () => {
      // 2% drift with 2% tolerance
      const result = computeDrift(BigNumber.from(10000), BigNumber.from(9800), 200)
      expect(result.driftBps).toBe(200)
      expect(result.withinTolerance).toBe(true)
    })
  })

  describe('and actual drift exceeds the tolerance', () => {
    it('should be flagged as out of tolerance', () => {
      // 3% drift with 2% tolerance
      const result = computeDrift(BigNumber.from(10000), BigNumber.from(9700), 200)
      expect(result.driftBps).toBe(300)
      expect(result.withinTolerance).toBe(false)
    })
  })

  describe('and actual is above expected (surplus)', () => {
    it('should measure the absolute drift', () => {
      const result = computeDrift(BigNumber.from(10000), BigNumber.from(10300), 200)
      expect(result.driftBps).toBe(300)
      expect(result.withinTolerance).toBe(false)
    })
  })

  describe('and both expected and actual are zero', () => {
    it('should report zero drift within tolerance', () => {
      const result = computeDrift(BigNumber.from(0), BigNumber.from(0), 200)
      expect(result.driftBps).toBe(0)
      expect(result.withinTolerance).toBe(true)
    })
  })

  describe('and expected is zero but actual is non-zero', () => {
    it('should flag maximal drift (unexpected funds)', () => {
      const result = computeDrift(BigNumber.from(0), BigNumber.from(500), 200)
      expect(result.driftBps).toBe(Number.MAX_SAFE_INTEGER)
      expect(result.withinTolerance).toBe(false)
    })
  })

  describe('and the amounts are 18-decimal MANA base units', () => {
    it('should not lose precision on large numbers', () => {
      const expected = BigNumber.from('1000000000000000000000') // 1000 MANA
      const actual = BigNumber.from('990000000000000000000') // 990 MANA => 1%
      const result = computeDrift(expected, actual, 200)
      expect(result.driftBps).toBe(100)
      expect(result.withinTolerance).toBe(true)
    })
  })
})
