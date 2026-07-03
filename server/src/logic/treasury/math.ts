import { BigNumber } from 'ethers'

import { MANA_DECIMALS, ORACLE_DECIMALS, USDC_DECIMALS } from '../config/chains'

/**
 * Pure treasury math. All amounts here are BigNumber base units (wei-like):
 *   - USDC amounts have 6 decimals
 *   - MANA amounts have 18 decimals
 *   - oracle price has 8 decimals (Chainlink style), expressed as USD per 1 MANA
 *
 * There is NO floating point in the conversion path — money math is integer-only to
 * avoid rounding drift. Helpers that take/return human-readable numbers (ether units)
 * exist only for config and display, never for settlement amounts.
 *
 * The core relationship (all in USD):
 *   usdcValue = manaAmount * price
 * so, solving for MANA:
 *   manaAmount = usdcValue / price
 *
 * Worked out in base units, keeping decimals explicit:
 *   mana(1e18) = usdc(1e6) * 1e(18-6) * 1e(oracleDecimals) / price(1eORACLE)
 */

const TEN = BigNumber.from(10)
const USDC_SCALE = TEN.pow(USDC_DECIMALS)
const MANA_SCALE = TEN.pow(MANA_DECIMALS)
const ORACLE_SCALE = TEN.pow(ORACLE_DECIMALS)
/** Basis points denominator: 10_000 bps = 100%. */
export const BPS_DENOMINATOR = BigNumber.from(10_000)

export class InvalidOraclePriceError extends Error {
  constructor(price: BigNumber) {
    super(`Oracle price must be a positive integer, got ${price.toString()}`)
  }
}

export class InvalidAmountError extends Error {
  constructor(what: string, value: BigNumber) {
    super(`${what} must be a non-negative integer, got ${value.toString()}`)
  }
}

function assertPositivePrice(price: BigNumber): void {
  if (price.lte(0)) {
    throw new InvalidOraclePriceError(price)
  }
}

function assertNonNegative(what: string, value: BigNumber): void {
  if (value.lt(0)) {
    throw new InvalidAmountError(what, value)
  }
}

/**
 * Converts a USDC amount (6dp) to the equivalent MANA amount (18dp) at an oracle price.
 * This is the "how much MANA does $X buy right now" quote the swap uses.
 *
 * Integer division truncates toward zero — the caller receives at most the exact amount,
 * never more, which is the safe direction for a buyer of MANA.
 *
 * @param usdcAmount USDC in base units (6 decimals)
 * @param oraclePrice USD per MANA in oracle base units (8 decimals)
 * @returns MANA in base units (18 decimals)
 */
export function usdcToMana(usdcAmount: BigNumber, oraclePrice: BigNumber): BigNumber {
  assertNonNegative('usdcAmount', usdcAmount)
  assertPositivePrice(oraclePrice)
  // mana = usdc * MANA_SCALE * ORACLE_SCALE / (USDC_SCALE * price)
  return usdcAmount.mul(MANA_SCALE).mul(ORACLE_SCALE).div(USDC_SCALE).div(oraclePrice)
}

/**
 * Converts a MANA amount (18dp) to the USDC amount (6dp) it is worth at an oracle price.
 * The inverse of {@link usdcToMana}. Used to size a refill: "to buy N MANA I must spend
 * roughly $Y". Integer division truncates; callers that must guarantee they buy AT LEAST
 * N MANA should apply a buffer (see {@link applyBufferBps}).
 *
 * @param manaAmount MANA in base units (18 decimals)
 * @param oraclePrice USD per MANA in oracle base units (8 decimals)
 * @returns USDC in base units (6 decimals)
 */
export function manaToUsdc(manaAmount: BigNumber, oraclePrice: BigNumber): BigNumber {
  assertNonNegative('manaAmount', manaAmount)
  assertPositivePrice(oraclePrice)
  // usdc = mana * price * USDC_SCALE / (MANA_SCALE * ORACLE_SCALE)
  return manaAmount.mul(oraclePrice).mul(USDC_SCALE).div(MANA_SCALE).div(ORACLE_SCALE)
}

/**
 * Reduces an amount by a slippage tolerance in basis points, giving the minimum
 * acceptable output of a swap. E.g. 300 bps on 1000 => 970. This is the `amountOutMin`
 * / slippage guard passed to the DEX router; a fill below it must revert.
 *
 * @param amount expected output amount (any base unit)
 * @param slippageBps tolerance in basis points (300 = 3%)
 * @returns amount * (1 - slippageBps/10000), truncated
 */
export function applySlippageFloor(amount: BigNumber, slippageBps: number): BigNumber {
  assertNonNegative('amount', amount)
  if (slippageBps < 0 || slippageBps > BPS_DENOMINATOR.toNumber()) {
    throw new Error(`slippageBps out of range [0, 10000]: ${slippageBps}`)
  }
  const keptBps = BPS_DENOMINATOR.sub(slippageBps)
  return amount.mul(keptBps).div(BPS_DENOMINATOR)
}

/**
 * Increases an amount by a buffer in basis points. Used to over-buy MANA relative to the
 * oracle quote so the fill still covers the settlement price after the oracle/DEX spread.
 * E.g. 50 bps on 1000 => 1005.
 *
 * @param amount base amount (any base unit)
 * @param bufferBps buffer in basis points (50 = 0.5%)
 * @returns amount * (1 + bufferBps/10000), truncated
 */
export function applyBufferBps(amount: BigNumber, bufferBps: number): BigNumber {
  assertNonNegative('amount', amount)
  if (bufferBps < 0) {
    throw new Error(`bufferBps must be >= 0: ${bufferBps}`)
  }
  return amount.mul(BPS_DENOMINATOR.add(bufferBps)).div(BPS_DENOMINATOR)
}

/**
 * Human ether-units (e.g. "150.5") -> MANA base units (18dp). Config/threshold helper —
 * NEVER use for settlement amounts derived from money in; those stay in base units.
 */
export function manaEtherToBase(ether: number): BigNumber {
  return numberToScaledBigNumber(ether, MANA_DECIMALS)
}

/** MANA base units (18dp) -> human ether-units number. For logging/metrics only. */
export function manaBaseToEther(base: BigNumber): number {
  return scaledBigNumberToNumber(base, MANA_DECIMALS)
}

/** Human dollars (e.g. "10.25") -> USDC base units (6dp). */
export function usdcDollarsToBase(dollars: number): BigNumber {
  return numberToScaledBigNumber(dollars, USDC_DECIMALS)
}

/** USDC base units (6dp) -> human dollars number. For logging/metrics only. */
export function usdcBaseToDollars(base: BigNumber): number {
  return scaledBigNumberToNumber(base, USDC_DECIMALS)
}

/** Oracle price base units (8dp) -> human USD/MANA number. For display only. */
export function oraclePriceToUsd(price: BigNumber): number {
  return scaledBigNumberToNumber(price, ORACLE_DECIMALS)
}

/**
 * Converts a decimal number into a scaled BigNumber with `decimals` places, without
 * relying on ethers' parseUnits (which rejects excess precision). Extra fractional
 * digits beyond `decimals` are truncated.
 */
function numberToScaledBigNumber(value: number, decimals: number): BigNumber {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Cannot scale a non-finite/negative number: ${value}`)
  }
  const [wholePart, fracPartRaw = ''] = value.toString().split('.')
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, '0')
  const combined = `${wholePart}${fracPart}`.replace(/^0+(?=\d)/, '')
  return BigNumber.from(combined === '' ? '0' : combined)
}

/**
 * Converts a scaled BigNumber back to a JS number. Precision-lossy by nature — only for
 * display, logs, and metrics gauges, never for balance comparisons.
 */
function scaledBigNumberToNumber(value: BigNumber, decimals: number): number {
  const scale = TEN.pow(decimals)
  const whole = value.div(scale)
  const frac = value.mod(scale)
  return Number(whole.toString()) + Number(frac.toString()) / Number(scale.toString())
}
