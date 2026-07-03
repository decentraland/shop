import { BigNumber } from 'ethers'

import { BPS_DENOMINATOR } from '../math'

/**
 * Pure drift computation between an expected and an actual balance. Extracted so drift
 * detection is testable without a database or a chain.
 *
 * Drift is measured in basis points of the expected amount:
 *   driftBps = |actual - expected| / expected * 10000
 *
 * Edge cases, chosen deliberately for a treasury:
 *   - expected == 0 and actual == 0  -> 0 bps, within tolerance (nothing owed, nothing held)
 *   - expected == 0 and actual  > 0  -> treated as maximal drift (unexpected funds present),
 *     flagged unless toleranceBps is effectively infinite. We surface it rather than divide
 *     by zero, because unexplained balance is itself a reconciliation signal.
 */
export function computeDrift(
  expected: BigNumber,
  actual: BigNumber,
  toleranceBps: number
): { driftBps: number; withinTolerance: boolean } {
  const diff = actual.sub(expected).abs()

  if (expected.isZero()) {
    if (diff.isZero()) {
      return { driftBps: 0, withinTolerance: true }
    }
    // Non-zero balance against a zero expectation: report as over-tolerance.
    return { driftBps: Number.MAX_SAFE_INTEGER, withinTolerance: false }
  }

  // driftBps = diff * 10000 / expected. Compute in BigNumber to avoid precision loss, then
  // clamp to a JS-safe number for reporting.
  const driftBpsBn = diff.mul(BPS_DENOMINATOR).div(expected.abs())
  const maxSafe = BigNumber.from(Number.MAX_SAFE_INTEGER.toString())
  const driftBps = driftBpsBn.gt(maxSafe) ? Number.MAX_SAFE_INTEGER : driftBpsBn.toNumber()

  return { driftBps, withinTolerance: driftBps <= toleranceBps }
}
