import { BigNumber } from 'ethers'

import { RefillPlan } from '../../../types/components'
import { RefillStrategy } from '../../config/types'
import { manaEtherToBase, manaToUsdc } from '../math'

/**
 * Pure refill-decision logic — no chain, no I/O. Given the CreditsManager's current MANA
 * balance, the oracle price, and the configured thresholds, decides whether to refill and
 * by how much. Extracted from the component so every branch (below / above / at the edge /
 * dust) is exhaustively unit-testable.
 *
 * Working-balance strategy:
 *   - If balance >= threshold: do nothing.
 *   - Else: top up to the target, i.e. acquire (target - balance) MANA... but only if that
 *     shortfall is at least `minRefill` MANA (dust guard), otherwise skip.
 *
 * Just-in-time strategy (batch of imminent demand):
 *   - `pendingDemandMana` is how much MANA imminent purchases need. Refill exactly the
 *     shortfall between balance and that demand (no standing buffer), subject to the same
 *     dust guard. When no demand is supplied it degrades to "keep balance at/above 0".
 *
 * The USDC to spend is derived from the MANA to acquire at the oracle price, then the
 * caller applies the oracle-spread buffer before swapping (kept out of here so the pure
 * function stays about the threshold decision).
 */
export function computeRefillPlan(params: {
  strategy: RefillStrategy
  currentManaBalance: BigNumber
  oraclePrice: BigNumber
  targetManaEther: number
  thresholdManaEther: number
  minRefillManaEther: number
  /** Only used by just-in-time: imminent demand to cover, in MANA base units (18dp). */
  pendingDemandMana?: BigNumber
}): RefillPlan {
  const {
    strategy,
    currentManaBalance,
    oraclePrice,
    targetManaEther,
    thresholdManaEther,
    minRefillManaEther,
    pendingDemandMana
  } = params

  const target = manaEtherToBase(targetManaEther)
  const threshold = manaEtherToBase(thresholdManaEther)
  const minRefill = manaEtherToBase(minRefillManaEther)

  const noop = (reason: string): RefillPlan => ({
    shouldRefill: false,
    currentManaBalance,
    manaToAcquire: BigNumber.from(0),
    usdcToSpend: BigNumber.from(0),
    reason
  })

  if (strategy === RefillStrategy.JUST_IN_TIME) {
    const demand = pendingDemandMana ?? BigNumber.from(0)
    if (currentManaBalance.gte(demand)) {
      return noop(`balance ${currentManaBalance.toString()} already covers demand ${demand.toString()}`)
    }
    const shortfall = demand.sub(currentManaBalance)
    if (shortfall.lt(minRefill)) {
      return noop(`shortfall ${shortfall.toString()} below dust floor ${minRefill.toString()}`)
    }
    return buildPlan(currentManaBalance, shortfall, oraclePrice, `just-in-time: covering demand shortfall`)
  }

  // Working-balance (default).
  if (currentManaBalance.gte(threshold)) {
    return noop(`balance ${currentManaBalance.toString()} at/above threshold ${threshold.toString()}`)
  }
  const shortfall = target.sub(currentManaBalance)
  if (shortfall.lt(minRefill)) {
    return noop(`shortfall ${shortfall.toString()} below dust floor ${minRefill.toString()}`)
  }
  return buildPlan(currentManaBalance, shortfall, oraclePrice, `working-balance: topping up to target`)
}

function buildPlan(
  currentManaBalance: BigNumber,
  manaToAcquire: BigNumber,
  oraclePrice: BigNumber,
  reason: string
): RefillPlan {
  return {
    shouldRefill: true,
    currentManaBalance,
    manaToAcquire,
    usdcToSpend: manaToUsdc(manaToAcquire, oraclePrice),
    reason
  }
}
