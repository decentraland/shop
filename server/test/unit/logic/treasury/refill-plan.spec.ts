import { BigNumber } from 'ethers'

import { RefillStrategy } from '../../../../src/logic/config/types'
import { manaEtherToBase, manaToUsdc } from '../../../../src/logic/treasury/math'
import { computeRefillPlan } from '../../../../src/logic/treasury/refill/plan'

const PRICE_1USD = BigNumber.from('100000000') // $1/MANA, 8dp

// Standard working-balance config for these tests.
const base = {
  oraclePrice: PRICE_1USD,
  targetManaEther: 1000,
  thresholdManaEther: 200,
  minRefillManaEther: 10
}

describe('when planning a refill with the working-balance strategy', () => {
  const strategy = RefillStrategy.WORKING_BALANCE

  describe('and the balance is above the threshold', () => {
    it('should not refill', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(500)
      })
      expect(plan.shouldRefill).toBe(false)
      expect(plan.manaToAcquire.toString()).toBe('0')
      expect(plan.usdcToSpend.toString()).toBe('0')
    })
  })

  describe('and the balance is exactly at the threshold', () => {
    it('should not refill (threshold is inclusive)', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(200)
      })
      expect(plan.shouldRefill).toBe(false)
    })
  })

  describe('and the balance is just below the threshold', () => {
    it('should refill up to the target', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(199)
      })
      expect(plan.shouldRefill).toBe(true)
      // target(1000) - balance(199) = 801 MANA
      expect(plan.manaToAcquire.toString()).toBe(manaEtherToBase(801).toString())
      // at $1/MANA, 801 MANA costs $801 => 801_000000 base USDC
      expect(plan.usdcToSpend.toString()).toBe(manaToUsdc(manaEtherToBase(801), PRICE_1USD).toString())
    })
  })

  describe('and the balance is zero', () => {
    it('should refill the full target', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: BigNumber.from(0)
      })
      expect(plan.shouldRefill).toBe(true)
      expect(plan.manaToAcquire.toString()).toBe(manaEtherToBase(1000).toString())
    })
  })

  describe('and the shortfall is below the dust floor', () => {
    it('should not refill even though the balance is under the threshold', () => {
      // target 1000, threshold 200, minRefill 10. A balance of 995 is under threshold?
      // No — 995 > 200, so use a config where threshold is high and shortfall is tiny.
      const plan = computeRefillPlan({
        strategy,
        oraclePrice: PRICE_1USD,
        targetManaEther: 1000,
        thresholdManaEther: 1000, // threshold == target, so any dip triggers evaluation
        minRefillManaEther: 10,
        currentManaBalance: manaEtherToBase(995) // shortfall 5 < dust 10
      })
      expect(plan.shouldRefill).toBe(false)
      expect(plan.reason).toContain('dust floor')
    })
  })

  describe('and the shortfall is exactly at the dust floor', () => {
    it('should refill (dust floor is inclusive)', () => {
      const plan = computeRefillPlan({
        strategy,
        oraclePrice: PRICE_1USD,
        targetManaEther: 1000,
        thresholdManaEther: 1000,
        minRefillManaEther: 10,
        currentManaBalance: manaEtherToBase(990) // shortfall exactly 10
      })
      expect(plan.shouldRefill).toBe(true)
      expect(plan.manaToAcquire.toString()).toBe(manaEtherToBase(10).toString())
    })
  })
})

describe('when planning a refill with the just-in-time strategy', () => {
  const strategy = RefillStrategy.JUST_IN_TIME

  describe('and the balance already covers pending demand', () => {
    it('should not refill', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(500),
        pendingDemandMana: manaEtherToBase(300)
      })
      expect(plan.shouldRefill).toBe(false)
    })
  })

  describe('and the balance exactly covers pending demand', () => {
    it('should not refill', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(300),
        pendingDemandMana: manaEtherToBase(300)
      })
      expect(plan.shouldRefill).toBe(false)
    })
  })

  describe('and pending demand exceeds the balance', () => {
    it('should refill exactly the shortfall (no standing buffer)', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(100),
        pendingDemandMana: manaEtherToBase(350)
      })
      expect(plan.shouldRefill).toBe(true)
      // shortfall = 350 - 100 = 250, NOT topped up to target
      expect(plan.manaToAcquire.toString()).toBe(manaEtherToBase(250).toString())
    })
  })

  describe('and the shortfall is below the dust floor', () => {
    it('should not refill', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(100),
        pendingDemandMana: manaEtherToBase(105) // shortfall 5 < dust 10
      })
      expect(plan.shouldRefill).toBe(false)
      expect(plan.reason).toContain('dust floor')
    })
  })

  describe('and no pending demand is supplied', () => {
    it('should not refill (nothing to cover)', () => {
      const plan = computeRefillPlan({
        ...base,
        strategy,
        currentManaBalance: manaEtherToBase(50)
      })
      expect(plan.shouldRefill).toBe(false)
    })
  })
})
