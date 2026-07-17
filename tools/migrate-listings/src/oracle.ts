import { ethers } from 'ethers'
import { ContractName, getContract } from './dcl-transactions'
import { config, USD_WEI_PER_CREDIT, type RoundMode } from './config'
import type { OracleSnapshot } from './types'

// Mirrors the READ side of shop/app/src/lib/buy.ts:tradeManaPriceWei, but INVERTED: buy.ts converts
// USD→MANA (usdWei * 10^dec / rate); migration converts MANA→USD (manaWei * rate / 10^dec).

const MARKET_AGG_ABI = ['function manaUsdAggregator() view returns (address)']
const AGG_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
]

export function readProvider(): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(config.rpcUrl)
}

/**
 * Read the MANA/USD oracle for a chain, once per run. Resolves the aggregator address off the
 * marketplace contract (same source the contract itself uses at settlement); falls back to the
 * configured mock address only if that read fails.
 */
export async function readOracle(chainId: number): Promise<OracleSnapshot> {
  const provider = readProvider()
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)

  let aggregatorAddress = config.fallbackAggregator
  try {
    const mkt = new ethers.Contract(market.address, MARKET_AGG_ABI, provider)
    const addr: string = await mkt.manaUsdAggregator()
    if (addr && addr !== ethers.constants.AddressZero) aggregatorAddress = addr
  } catch {
    // keep the fallback
  }

  const agg = new ethers.Contract(aggregatorAddress, AGG_ABI, provider)
  const decimals: number = await agg.decimals()
  const rd = await agg.latestRoundData()
  const rate = ethers.BigNumber.from(rd[1])
  if (rate.lte(0)) throw new Error(`Oracle returned non-positive rate for chain ${chainId}`)

  return {
    aggregatorAddress,
    decimals,
    rate: rate.toString(),
    readAtMs: Date.now(),
  }
}

/** MANA wei → USD wei (1e18 = $1). usdWei = manaWei * rate / 10^decimals. All BigInt. */
export function manaWeiToUsdWei(manaWei: string, oracle: OracleSnapshot): bigint {
  const mana = BigInt(manaWei)
  const rate = BigInt(oracle.rate)
  const scale = 10n ** BigInt(oracle.decimals)
  return (mana * rate) / scale
}

/**
 * Round a USD-wei price per policy (MIGRATION_SPEC §3.3) and clamp to the minimum credit floor.
 * 'credit' rounds to the nearest whole credit (1e17 USD wei) so the Shop's whole-credit display is
 * exact. 'up'/'down' round the credit the same way but directionally. 'none' keeps exact USD wei.
 */
export function roundUsdWei(usdWei: bigint, mode: RoundMode): bigint {
  const floorWei = USD_WEI_PER_CREDIT * BigInt(Math.max(1, config.minCredits))
  let out: bigint
  if (mode === 'none') {
    out = usdWei
  } else {
    const q = usdWei / USD_WEI_PER_CREDIT
    const r = usdWei % USD_WEI_PER_CREDIT
    let credits: bigint
    if (mode === 'up') credits = r > 0n ? q + 1n : q
    else if (mode === 'down') credits = q
    else credits = r * 2n >= USD_WEI_PER_CREDIT ? q + 1n : q // nearest
    out = credits * USD_WEI_PER_CREDIT
  }
  return out < floorWei ? floorWei : out
}

export function usdWeiToCredits(usdWei: bigint): number {
  return Number(usdWei / USD_WEI_PER_CREDIT)
}

export function formatUsd(usdWei: bigint): string {
  // 1e18 = $1. Show two decimals.
  const cents = usdWei / 10000000000000000n // 1e16 = 1 cent
  const whole = cents / 100n
  const frac = (cents % 100n).toString().padStart(2, '0')
  return `$${whole.toString()}.${frac}`
}
