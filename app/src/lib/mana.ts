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

// The read-only RPC for a chain. MANA is deployed on both Polygon and Ethereum L1 at DIFFERENT
// addresses, so the contract's chain and the RPC it is queried over must always agree: resolving the L1
// MANA address and then calling balanceOf on the Polygon RPC hits an address that holds no such
// contract there, which answers 0 instead of failing — a wrong balance, not an error.
function rpcUrlForChain(chainId: number): string {
  return chainId === config.ethereumChainId ? config.ethereumRpcUrl : config.rpcUrl
}

// An address's MANA balance in wei (18 decimals) on ONE chain. ERC20 balanceOf on that chain's MANA
// token, over that chain's own RPC. Returns a bigint so the caller can compare it against a trade's
// MANA price without float drift.
//
// Defaults to the shop's settlement chain (Polygon). Callers deciding whether MANA can PAY for
// something must keep that default: a Polygon trade cannot be settled with L1 MANA, so the balance that
// gates a payment rail is the Polygon one regardless of where the wallet currently sits.
export async function readManaBalanceWei(address: string, chainId: number = config.chainId): Promise<bigint> {
  const mana = getContract(ContractName.MANAToken, chainId)
  const provider = new ethers.providers.JsonRpcProvider(rpcUrlForChain(chainId))
  const erc20 = new ethers.Contract(mana.address, ERC20_BALANCE_ABI, provider) as Erc20BalanceContract
  const balance = await erc20.balanceOf(address)
  return BigInt(balance.toString())
}

// MANA held on BOTH chains, for DISPLAY only (the navbar shows what the wallet owns, wherever it sits).
// Read over each chain's own RPC and never through the wallet's provider, so the figures do not depend
// on the connected network — a wallet on Ethereum still sees its Polygon MANA, and vice versa. This
// mirrors what the marketplace does (decentraland-dapps' buildWallet walks the app chain's whole
// network mapping rather than just the connected chain).
//
// Per-chain failures are isolated: one RPC being down must not blank out the other chain's balance, so
// a rejected read reports 0n for that chain instead of failing the pair. Same trade-off dapps' own
// fetchManaBalance makes.
export async function readManaBalancesWei(address: string): Promise<{ ethereum: bigint; matic: bigint }> {
  const [ethereum, matic] = await Promise.all([
    readManaBalanceWei(address, config.ethereumChainId).catch(() => 0n),
    readManaBalanceWei(address, config.chainId).catch(() => 0n)
  ])
  return { ethereum, matic }
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

// Display helpers live in lib/mana-format (pure, no contract imports) — re-exported here so existing
// callers of ~/lib/mana keep working.
export { manaWeiToNumber, formatMana } from '~/lib/mana-format'
