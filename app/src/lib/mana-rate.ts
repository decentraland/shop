import { ethers } from 'ethers'
import { ContractName, getContract } from 'decentraland-transactions'
import { config } from '~/config'

// The live MANA→USD market rate + the MANA-wei→credits conversion used by the Market tab.
//
// Source: the SAME on-chain oracle the purchase path uses. USD-pegged trades convert USD→MANA via
// marketplace.manaUsdAggregator() (see lib/buy.ts tradeManaPriceWei); here we read that aggregator
// directly and go the other way (MANA→USD) so we can DISPLAY a legacy MANA listing's price in
// credits before any purchase. Reading the oracle (rather than the credits-server) means the grid
// can show prices with no wallet/auth — and it's the exact rate settlement will use.
//
// The displayed credit price is only INDICATIVE (it drifts with the rate). The price is LOCKED at
// checkout by the credits-server authorize call (which sizes MANA at its own oracle read and signs a
// fixed maxCreditedValue) — see pages/Market checkout.

export type ManaRate = { rate: bigint; decimals: number }

const USD_WEI_PER_CREDIT = 10n ** 17n // 1 credit = $0.10 = 1e17 USD wei

// Read the MANA/USD Chainlink-style aggregator off the marketplace contract (decoupled from the
// wallet's network via the read-only RPC). Throws if the oracle is unreachable/stale so callers can
// disable Buy Now with a message instead of pricing off a bad rate.
export async function readManaUsdRate(chainId: number = config.chainId): Promise<ManaRate> {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const mkt = new ethers.Contract(market.address, ['function manaUsdAggregator() view returns (address)'], provider)
  const aggAddr: string = await mkt.manaUsdAggregator()
  const agg = new ethers.Contract(
    aggAddr,
    ['function decimals() view returns (uint8)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'],
    provider
  )
  const decimals: number = await agg.decimals()
  const rd = await agg.latestRoundData()
  const rate = BigInt(rd[1].toString())
  if (rate <= 0n) throw new Error('mana rate unavailable')
  return { rate, decimals: Number(decimals) }
}

// MANA wei (18 decimals) → USD wei (1e18 = $1) at the given rate: usdWei = manaWei * rate / 10^dec.
export function manaWeiToUsdWei(manaWei: string, { rate, decimals }: ManaRate): bigint {
  return (BigInt(manaWei) * rate) / 10n ** BigInt(decimals)
}

// MANA wei → credits (1 credit = $0.10), rounded UP so the shown price never sits BELOW what
// checkout charges at the display rate, floored at 1 credit. Returns null on a malformed manaWei so
// the UI can show "price unavailable" instead of a fake "1 credit". BigInt throughout (no float drift).
export function manaWeiToCredits(manaWei: string, rate: ManaRate): number | null {
  let usdWei: bigint
  try {
    usdWei = manaWeiToUsdWei(manaWei, rate)
  } catch {
    return null
  }
  const whole = usdWei / USD_WEI_PER_CREDIT
  const credits = usdWei % USD_WEI_PER_CREDIT > 0n ? whole + 1n : whole
  const n = Number(credits)
  return n < 1 ? 1 : n
}

// MANA wei → USD cents, rounded UP. Used to size the credits-server authorize amount for a legacy
// Buy Now (the server then locks MANA at its own oracle read + signs the fixed maxCreditedValue).
export function manaWeiToUsdCents(manaWei: string, rate: ManaRate): number {
  let usdWei: bigint
  try {
    usdWei = manaWeiToUsdWei(manaWei, rate)
  } catch {
    return 0
  }
  const centWei = 10n ** 16n // 1e16 wei = 1 cent
  const whole = usdWei / centWei
  const cents = usdWei % centWei > 0n ? whole + 1n : whole
  return Number(cents)
}
