import { ethers } from 'ethers'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
import { config } from '~/config'
import { ensureChain } from '~/lib/trades'
import {
  amoyGasOverrides,
  buildUseCreditsArgs,
  getOnChainTrade,
  type CreditPurchase,
  type SpendableCredit
} from '~/lib/trade-encoding'

// Re-export the shared vocabulary so existing importers (Cart, tests) keep their `~/lib/buy` imports.
export type { CreditPurchase, SpendableCredit } from '~/lib/trade-encoding'

// The MANA the trade settles for. USD-pegged trades convert USD→MANA via the on-chain oracle
// (+2% buffer so the approval covers rounding); plain ERC20 trades use the amount directly.
async function tradeManaPriceWei(trade: Trade): Promise<string> {
  const priceAsset = trade.received[0] as { assetType: number; amount?: string }
  const amount = priceAsset.amount ?? '0'
  if (priceAsset.assetType !== TradeAssetType.USD_PEGGED_MANA) return amount

  const market = getContract(getContractName(trade.contract), trade.chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const mkt = new ethers.Contract(market.address, ['function manaUsdAggregator() view returns (address)'], provider)
  const aggAddr: string = await mkt.manaUsdAggregator()
  const agg = new ethers.Contract(
    aggAddr,
    ['function decimals() view returns (uint8)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'],
    provider
  )
  const dec: number = await agg.decimals()
  const rd = await agg.latestRoundData()
  const rate = ethers.BigNumber.from(rd[1])
  const manaWei = ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(10).pow(dec)).div(rate)
  return manaWei.mul(102).div(100).toString() // +2% buffer
}

async function sendUseCredits(chainId: number, args: unknown, signer: ethers.Signer): Promise<string> {
  const cm = getContract(ContractName.CreditsManager, chainId)
  const contract = new ethers.Contract(cm.address, cm.abi, signer)
  const tx = await contract.useCredits(args, amoyGasOverrides(chainId))
  const receipt = await tx.wait()
  return receipt.transactionHash
}

/**
 * Take down an active listing: the off-chain listing is a signed trade, so cancelling it means
 * invalidating that signature on-chain via marketplace.cancelSignature(trade). Only the listing's
 * signer (the seller) can cancel their own. Mirrors decentraland-dapps' TradeService.cancel.
 * Returns the tx hash.
 */
export async function cancelListing(opts: { trade: Trade; signer: ethers.Signer }): Promise<string> {
  const { trade, signer } = opts
  const seller = (await signer.getAddress()).toLowerCase()
  // cancelSignature is a REAL transaction, so it must run on the trade's chain — a restored session
  // can leave the wallet on whatever network it last used. Switch just-in-time (mirrors ensureApproval);
  // the off-chain listing signature itself is never gated on chain (see CONVENTIONS.md).
  await ensureChain(signer.provider as ethers.providers.Web3Provider, trade.chainId)
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  // beneficiary is irrelevant to the cancel hash (sent assets are signed without one); pass the seller.
  const onChainTrade = getOnChainTrade(trade, seller)
  const contract = new ethers.Contract(marketplace.address, marketplace.abi, signer)
  // cancelSignature takes a Trade[] (mirrors accept([...]) — see TradeService.cancel, which calls
  // it with [tradeToCancel]). Passing a single trade fails to ABI-encode as tuple[] and reverts.
  const tx = await contract.cancelSignature([onChainTrade], amoyGasOverrides(trade.chainId))
  const receipt = await tx.wait()
  return receipt.transactionHash
}

/** Buy a listed NFT with the buyer's credits: builds + submits CreditsManager.useCredits(accept([trade])). */
export async function buyWithCredits(opts: {
  trade: Trade
  buyer: string
  signer: ethers.Signer
  credits: SpendableCredit[]
  // For USD credits the server already sized the MANA cap for this purchase; pass it to skip the
  // client-side oracle read. Legacy MANA credits omit it and we derive it from the trade.
  maxCreditedValue?: string
}): Promise<string> {
  const { trade, buyer, signer, credits } = opts
  if (credits.length === 0) throw new Error('No credits to spend')

  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const maxCreditedValue = opts.maxCreditedValue ?? (await tradeManaPriceWei(trade))
  const args = buildUseCreditsArgs(marketplace.address, marketplace.abi, [trade], buyer, credits, maxCreditedValue)
  return sendUseCredits(trade.chainId, args, signer)
}

/**
 * Buy several listings in as few signatures as possible: all trades on the same marketplace are
 * fulfilled by ONE accept([...]) inside a single useCredits() (one signature/tx), spending one
 * ephemeral credit per item. Trades on different marketplaces are split into one tx each.
 * The CreditsManager consumes each credit for its own item and settlement stays per-item (the squid
 * records consumption per credit id = intent salt). Returns the tx hash(es).
 *
 * Caveat: the CreditsManager caps the credited MANA per call at the hourly limit; a very large basket
 * could exceed it and revert (ExternalCallFailed). Fine for demo-scale baskets.
 */
export async function buyManyWithCredits(opts: {
  purchases: CreditPurchase[]
  buyer: string
  signer: ethers.Signer
}): Promise<string[]> {
  const { purchases, buyer, signer } = opts
  if (purchases.length === 0) throw new Error('No items to buy')

  // Group by (chain, marketplace) so each group is one accept([...]) → one signature.
  const groups = new Map<string, CreditPurchase[]>()
  for (const p of purchases) {
    const key = `${p.trade.chainId}:${p.trade.contract.toLowerCase()}`
    const g = groups.get(key)
    if (g) g.push(p)
    else groups.set(key, [p])
  }

  const hashes: string[] = []
  for (const group of groups.values()) {
    const { chainId, contract } = group[0].trade
    const marketplace = getContract(getContractName(contract), chainId)
    const trades = group.map(p => p.trade)
    const credits = group.flatMap(p => p.credits)
    const maxCreditedValue = group
      .reduce((acc, p) => acc.add(ethers.BigNumber.from(p.maxCreditedValue)), ethers.BigNumber.from(0))
      .toString()
    const args = buildUseCreditsArgs(marketplace.address, marketplace.abi, trades, buyer, credits, maxCreditedValue)
    hashes.push(await sendUseCredits(chainId, args, signer))
  }
  return hashes
}
