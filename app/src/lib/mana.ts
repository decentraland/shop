import { ethers } from 'ethers'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
import { config } from '~/config'

// MANA reads for the "pay with MANA" Buy Now option: the buyer's on-chain MANA balance (to decide
// whether to OFFER MANA at all) and a trade's MANA price (to display it + gate on sufficiency).
//
// Both reads go through the read-only target-chain RPC (config.rpcUrl), NOT the wallet's provider —
// exactly like readManaUsdRate (lib/mana-rate) and getAuthorizationStatus (lib/authorizations) — so
// the balance/price can be read with no wallet network switch and regardless of which chain the
// wallet is currently on.

const ERC20_BALANCE_ABI = ['function balanceOf(address owner) view returns (uint256)']

type Erc20BalanceContract = ethers.Contract & {
  balanceOf(owner: string): Promise<ethers.BigNumber>
}
type OracleReaderContract = ethers.Contract & {
  manaUsdAggregator(): Promise<string>
}
type AggregatorContract = ethers.Contract & {
  decimals(): Promise<number>
  latestRoundData(): Promise<[ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber]>
}

// The connected address's MANA balance in wei (18 decimals). ERC20 balanceOf on the MANA token for
// the target chain. Returns a bigint so the caller can compare it against a trade's MANA price without
// float drift.
export async function readManaBalanceWei(address: string, chainId: number = config.chainId): Promise<bigint> {
  const mana = getContract(ContractName.MANAToken, chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const erc20 = new ethers.Contract(mana.address, ERC20_BALANCE_ABI, provider) as Erc20BalanceContract
  const balance = await erc20.balanceOf(address)
  return BigInt(balance.toString())
}

// The MANA (wei) a trade costs RIGHT NOW, for display + the sufficiency gate. USD-pegged trades read
// the marketplace's MANA/USD oracle (the same aggregator lib/buy.ts:tradeManaPriceWei and
// lib/mana-rate use); plain-ERC20 MANA trades use the signed amount directly. No buffer here — this is
// the figure the user sees and the balance is checked against; the on-chain accept recomputes the
// exact settlement amount from the oracle at that block. (buy.ts applies a +2% buffer only for the
// credit-settled cap, which is a different concern; kept separate to avoid touching that path.)
export async function readTradeManaPriceWei(trade: Trade, chainId: number = trade.chainId): Promise<bigint> {
  const priceAsset = trade.received[0] as { assetType: number; amount?: string }
  const amount = priceAsset.amount ?? '0'
  if (priceAsset.assetType !== Number(TradeAssetType.USD_PEGGED_MANA)) return BigInt(amount)

  const market = getContract(getContractName(trade.contract), chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const mkt = new ethers.Contract(
    market.address,
    ['function manaUsdAggregator() view returns (address)'],
    provider
  ) as OracleReaderContract
  const aggAddr = await mkt.manaUsdAggregator()
  const agg = new ethers.Contract(
    aggAddr,
    [
      'function decimals() view returns (uint8)',
      'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'
    ],
    provider
  ) as AggregatorContract
  const dec = await agg.decimals()
  const rd = await agg.latestRoundData()
  const rate = BigInt(rd[1].toString())
  if (rate <= 0n) throw new Error('mana rate unavailable')
  return (BigInt(amount) * 10n ** BigInt(dec)) / rate
}

// Whether the buyer can settle this trade directly in MANA (holds at least the price).
export function hasEnoughMana(balanceWei: bigint, priceWei: bigint): boolean {
  return balanceWei >= priceWei
}

// wei → whole-MANA number (lossy for display only; never used for on-chain math).
export function manaWeiToNumber(wei: bigint): number {
  return Number(wei) / 1e18
}

// Compact MANA amount for the option rows: whole thousands grouped, up to 2 decimals for sub-unit
// prices (e.g. 1000000000000000000n → "1", 1500000000000000000000n → "1,500"). Mirrors the credits
// display convention so both payment options read the same.
const manaFormatter = Intl.NumberFormat('en', { maximumFractionDigits: 2 })
export function formatMana(wei: bigint): string {
  return manaFormatter.format(manaWeiToNumber(wei))
}
