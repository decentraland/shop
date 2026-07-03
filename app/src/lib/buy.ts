import { ethers } from 'ethers'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
import { config } from '~/config'
import { valueForAsset } from '~/lib/trades'

// The credit fields buyWithCredits actually spends — satisfied by both a legacy ServerCredit and
// an ephemeral AuthorizedCredit from /credits/authorize.
export type SpendableCredit = {
  id: string
  amount: string
  availableAmount: string
  expiresAt: number
  signature: string
}

const { defaultAbiCoder, Interface, hexZeroPad, hexlify, randomBytes } = ethers.utils

// On-chain Trade tuple[] — matches decentraland-dapps credits.js.
const TRADE_TUPLE_ARRAY =
  'tuple(address signer,bytes signature,' +
  'tuple(uint256 uses,uint256 expiration,uint256 effective,bytes32 salt,uint256 contractSignatureIndex,' +
  'uint256 signerSignatureIndex,bytes32 allowedRoot,bytes32[] allowedProof,' +
  'tuple(address contractAddress,bytes4 selector,bytes value,bool required)[] externalChecks) checks,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] sent,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] received)[]'

const ZERO32 = '0x' + '0'.repeat(64)

// The server stores checks.expiration/effective in MILLISECONDS, but they were SIGNED (via
// generateTradeValues → toSeconds) and are checked on-chain in SECONDS (block.timestamp). Passing
// the ms values makes the contract see the trade as "not effective yet" → NotEffective revert.
// Normalize: seconds are ~1e9, ms ~1e12.
const toChainSeconds = (v: number | string) => {
  const n = Number(v)
  return n > 1e12 ? Math.floor(n / 1000) : n
}

// Port of the webapp getOnChainTrade(): sent assets' beneficiary := buyer; allowedProof flattened.
function getOnChainTrade(trade: Trade, buyer: string) {
  return {
    signer: trade.signer,
    signature: trade.signature,
    checks: {
      uses: trade.checks.uses,
      expiration: toChainSeconds(trade.checks.expiration),
      effective: toChainSeconds(trade.checks.effective),
      salt: trade.checks.salt,
      contractSignatureIndex: trade.checks.contractSignatureIndex,
      signerSignatureIndex: trade.checks.signerSignatureIndex,
      // "0x" is truthy but NOT a valid bytes32 → normalize empty/"0x" to the 32-byte zero root.
      allowedRoot: trade.checks.allowedRoot && trade.checks.allowedRoot !== '0x' ? trade.checks.allowedRoot : ZERO32,
      allowedProof: [],
      externalChecks: (trade.checks.externalChecks ?? []).map(c => ({
        contractAddress: c.contractAddress,
        selector: c.selector,
        value: c.value,
        required: c.required
      }))
    },
    sent: trade.sent.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      beneficiary: buyer,
      extra: a.extra || '0x'
    })),
    received: trade.received.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      beneficiary: 'beneficiary' in a && a.beneficiary ? a.beneficiary : buyer,
      extra: a.extra || '0x'
    }))
  }
}

// Encode marketplace.accept([...trades]) — one external call fulfils every trade in the batch.
function buildAcceptCalldata(trades: Trade[], buyer: string, marketplaceAbi: unknown[]) {
  const selector = new Interface(marketplaceAbi as string[]).getSighash('accept')
  const data = defaultAbiCoder.encode([TRADE_TUPLE_ARRAY], [trades.map(t => getOnChainTrade(t, buyer))])
  return { selector, data }
}

// Amoy enforces a ~25 gwei minimum priority fee; MetaMask often proposes less → the RPC rejects with
// "gas tip cap below minimum". Floor the tip on Amoy so it goes through without manual editing.
function amoyGasOverrides(chainId: number): { maxPriorityFeePerGas?: ethers.BigNumber; maxFeePerGas?: ethers.BigNumber } {
  if (chainId !== 80002) return {}
  const tip = ethers.utils.parseUnits('30', 'gwei')
  return { maxPriorityFeePerGas: tip, maxFeePerGas: tip.add(ethers.utils.parseUnits('50', 'gwei')) }
}

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

function idToSalt(id: string): string {
  if (!id) return ZERO32
  return id.startsWith('0x') ? hexZeroPad(id, 32) : hexZeroPad('0x' + Buffer.from(id).toString('hex'), 32)
}

// A single trade paired with the credit(s) that pay for it and the MANA cap the server sized.
export type CreditPurchase = {
  trade: Trade
  credits: SpendableCredit[]
  maxCreditedValue: string
}

// Build the CreditsManager.useCredits() args for a set of trades on ONE marketplace, spending the
// given credits. maxCreditedValue is the total MANA the batch may draw; uncredited covers any gap the
// credits don't (0 for our ephemeral credits, which are sized exactly to their trades).
function buildUseCreditsArgs(
  marketplaceAddress: string,
  marketplaceAbi: unknown[],
  trades: Trade[],
  buyer: string,
  credits: SpendableCredit[],
  maxCreditedValue: string
) {
  const { selector, data } = buildAcceptCalldata(trades, buyer, marketplaceAbi)
  const sumAvailable = credits.reduce((acc, c) => acc.add(ethers.BigNumber.from(c.availableAmount)), ethers.BigNumber.from(0))
  const uncredited = ethers.BigNumber.from(maxCreditedValue).sub(sumAvailable)
  return {
    credits: credits.map(c => ({ value: c.amount, expiresAt: Number(c.expiresAt), salt: idToSalt(c.id) })),
    creditsSignatures: credits.map(c => c.signature),
    externalCall: {
      target: marketplaceAddress,
      selector,
      data,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      salt: hexlify(randomBytes(32))
    },
    customExternalCallSignature: '0x',
    maxUncreditedValue: uncredited.isNegative() ? '0' : uncredited.toString(),
    maxCreditedValue
  }
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
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  // beneficiary is irrelevant to the cancel hash (sent assets are signed without one); pass the seller.
  const onChainTrade = getOnChainTrade(trade, seller)
  const contract = new ethers.Contract(marketplace.address, marketplace.abi, signer)
  const tx = await contract.cancelSignature(onChainTrade, amoyGasOverrides(trade.chainId))
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
