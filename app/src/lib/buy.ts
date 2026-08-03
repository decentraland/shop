import { ethers } from 'ethers'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import {
  ContractName,
  ErrorCode,
  MetaTransactionError,
  getContract,
  getContractName,
  sendMetaTransaction,
  type ContractData
} from 'decentraland-transactions'
import { config } from '~/config'
import { metaTxProviderShim, readProvider } from '~/lib/authorizations'
import { gaslessConfig } from '~/lib/gasless-config'
import { ensureChain } from '~/lib/trades'
import {
  amoyGasOverrides,
  buildStoreUseCreditsArgs,
  buildUseCreditsArgs,
  getOnChainTrade,
  type CreditPurchase,
  type SpendableCredit,
  type StorePurchase
} from '~/lib/trade-encoding'

// Re-export the shared vocabulary so existing importers (Cart, tests) keep their `~/lib/buy` imports.
export type { CreditPurchase, SpendableCredit, StorePurchase } from '~/lib/trade-encoding'

/**
 * A basket line, on either purchase path. `acquisition` on the catalogue row is what picks between them:
 * an offchain trade is bought with `accept([trade])`, a CollectionStore mint with `buy([...items])`.
 */
export type AnyPurchase = ({ kind: 'trade' } & CreditPurchase) | ({ kind: 'store' } & StorePurchase)

/**
 * A basket as callers actually hand it over: each ELEMENT is either tagged or a bare trade.
 *
 * Deliberately `(A | B)[]` and not `A[] | B[]`. The union-of-arrays form silently rejects a mixed basket —
 * the one case this whole change exists to support — because an array literal holding both widens to a
 * member type that satisfies neither arm.
 */
export type MixedPurchases = (AnyPurchase | CreditPurchase)[]

/**
 * One wallet signature's worth of work: the lines that settle together in a single useCredits() call.
 *
 * Exported because the UI has to TELL a self-custody buyer how many times they will be asked to confirm,
 * and that number must come from the same code that creates the transactions. Counting groups in the view
 * layer would be a second implementation of this rule, free to drift from what actually gets submitted.
 */
export type PurchaseGroup =
  | { kind: 'trade'; chainId: number; marketplace: string; purchases: CreditPurchase[] }
  | { kind: 'store'; chainId: number; purchases: StorePurchase[] }

/**
 * Split a basket into the minimum number of transactions.
 *
 * `useCredits` takes exactly ONE external call, so a batch can only ever hit one target: all trades on the
 * same marketplace collapse into one `accept([...])`, and all store mints collapse into one `buy([...])` (the
 * contract takes an array, across collections). A mixed basket is therefore two signatures — the same shape
 * this already produced for a basket spanning two marketplaces.
 */
export function groupPurchases(purchases: MixedPurchases): PurchaseGroup[] {
  const groups = new Map<string, PurchaseGroup>()
  for (const p of normalizePurchases(purchases)) {
    if (p.kind === 'store') {
      const key = `store:${p.chainId}`
      const existing = groups.get(key)
      if (existing && existing.kind === 'store') existing.purchases.push(p)
      else groups.set(key, { kind: 'store', chainId: p.chainId, purchases: [p] })
      continue
    }
    const marketplace = p.trade.contract.toLowerCase()
    const key = `trade:${p.trade.chainId}:${marketplace}`
    const existing = groups.get(key)
    if (existing && existing.kind === 'trade') existing.purchases.push(p)
    else groups.set(key, { kind: 'trade', chainId: p.trade.chainId, marketplace, purchases: [p] })
  }
  return [...groups.values()]
}

/**
 * Tag bare CreditPurchase objects as trades.
 *
 * Callers that predate the store path (the cart, the item page, the tests) still pass untagged trades. Shared
 * by `groupPurchases` and `buyManyWithCredits` so the signature count the UI shows is derived from exactly the
 * same normalised input the transactions are built from — the whole point of exporting the grouping.
 */
function normalizePurchases(purchases: MixedPurchases): AnyPurchase[] {
  return purchases.map(p => ('kind' in p ? p : { kind: 'trade' as const, ...p }))
}

// Total MANA a group may draw: the sum of what the SERVER sized per line at /credits/authorize. Never
// re-derived from item or trade prices — see wrapInUseCredits for why that silently overcharges.
function groupMaxCreditedValue(purchases: { maxCreditedValue: string }[]): string {
  return purchases
    .reduce((acc, p) => acc.add(ethers.BigNumber.from(p.maxCreditedValue)), ethers.BigNumber.from(0))
    .toString()
}

// ethers v5 `Contract` exposes dynamically-named ABI methods through an `any` index signature, so
// reads come back untyped. Narrow each call site to the shape its ABI fragment actually returns.
type OracleReaderContract = ethers.Contract & {
  manaUsdAggregator(): Promise<string>
}
type AggregatorContract = ethers.Contract & {
  decimals(): Promise<number>
  latestRoundData(): Promise<[ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber]>
}
type MarketplaceContract = ethers.Contract & {
  cancelSignature(trades: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}
type CreditsManagerContract = ethers.Contract & {
  useCredits(args: unknown, overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

// The MANA the trade settles for. USD-pegged trades convert USD→MANA via the on-chain oracle
// (+2% buffer so the approval covers rounding); plain ERC20 trades use the amount directly.
async function tradeManaPriceWei(trade: Trade): Promise<string> {
  const priceAsset = trade.received[0] as { assetType: number; amount?: string }
  const amount = priceAsset.amount ?? '0'
  if (priceAsset.assetType !== Number(TradeAssetType.USD_PEGGED_MANA)) return amount

  const market = getContract(getContractName(trade.contract), trade.chainId)
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
  const rate = ethers.BigNumber.from(rd[1])
  const manaWei = ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(10).pow(dec)).div(rate)
  return manaWei.mul(102).div(100).toString() // +2% buffer
}

export async function sendUseCredits(
  chainId: number,
  args: unknown,
  signer: ethers.Signer,
  /**
   * Fired the moment the transaction is BROADCAST — the buyer confirmed and it is on its way — carrying the
   * hash, before the receipt is awaited.
   *
   * The hash matters because broadcast is the point of no return for the credits in that transaction: they
   * WILL be consumed on-chain whatever happens next in this process. A caller that fails afterwards must not
   * release their reservations, and this is the only signal that says which ones those are.
   */
  onSigned?: (txHash: string) => void
): Promise<string> {
  // useCredits is a REAL transaction, so it MUST run on the trade's chain. A restored session (or a
  // user who was last on another network) can leave the wallet on a different chain — without pinning
  // it first the wallet submits useCredits on its active network (e.g. Sepolia), where the
  // CreditsManager address has NO code: the call succeeds as a no-op, so a "successful" receipt comes
  // back but NO credits are consumed and NO item is bought. Switch just-in-time (mirrors cancelListing
  // and ensureApproval — the only other on-chain steps in the buy flow).
  const web3 = signer.provider as ethers.providers.Web3Provider
  await ensureChain(web3, chainId)
  // Belt-and-suspenders: never submit on the wrong chain even if the wallet ignored/failed the switch
  // silently. Re-read the active network and abort instead of sending useCredits into the void.
  const active = await web3.getNetwork()
  if (active.chainId !== chainId) {
    throw new Error(
      `Wrong network: wallet is on chain ${active.chainId}, expected ${chainId}. Switch networks and try again.`
    )
  }
  const cm = getContract(ContractName.CreditsManager, chainId)
  const contract = new ethers.Contract(cm.address, cm.abi, signer) as CreditsManagerContract
  const tx = await contract.useCredits(args, amoyGasOverrides(chainId))
  // Tx submitted (the buyer confirmed in their wallet) — settlement is next. Callers use this to flip
  // the UI from "confirm in your wallet" to "completing transaction", and to record that these credits are
  // now spoken for.
  onSigned?.(tx.hash)
  const receipt = await tx.wait()
  return receipt.transactionHash
}

/**
 * Take down an active listing: the off-chain listing is a signed trade, so cancelling it means
 * invalidating that signature on-chain via marketplace.cancelSignature(trade). Only the listing's
 * signer (the seller) can cancel their own. Mirrors decentraland-dapps' TradeService.cancel.
 * Returns the tx hash.
 */
// Gasless cancel: the seller signs an off-chain meta-tx and DCL's relayer submits it + pays the gas
// (mirrors grantViaMetaTransaction / the gasless buy path). The metaTxProviderShim routes signing to
// the wallet but every node read to the reliable target-chain RPC, so it never touches the wallet's
// flaky chain RPC — that's the -32002 "RPC endpoint returned too many errors" that killed the direct
// cancel. Managed (Magic/thirdweb) wallets hold no gas, so this is also the only path that works there.
async function cancelViaMetaTransaction(
  trade: Trade,
  signer: ethers.providers.JsonRpcSigner,
  seller: string
): Promise<string> {
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  // beneficiary is irrelevant to the cancel hash (sent assets are signed without one); pass the seller.
  const onChainTrade = getOnChainTrade(trade, seller)
  const functionData = new ethers.utils.Interface(marketplace.abi).encodeFunctionData('cancelSignature', [
    [onChainTrade]
  ])
  const rpc = readProvider()
  const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
  const txHash = await sendMetaTransaction(provider, rpc, functionData, marketplace, {
    serverURL: gaslessConfig.relayerUrl
  })
  await rpc.waitForTransaction(txHash, 1, 120_000)
  return txHash
}

// The minimal ERC721 surface we send. DCL collection contracts (ERC721CollectionV2) implement native
// meta-transactions, so `transferFrom` can be relayed exactly like `setApprovalForAll` / `cancelSignature`.
const ERC721_TRANSFER_ABI = ['function transferFrom(address from, address to, uint256 tokenId)']

// Gasless ERC721 transfer: the owner signs an off-chain meta-tx and DCL's relayer submits it + pays the
// gas. Mirrors cancelViaMetaTransaction. The meta-tx is signed against the collection's fixed
// ERC721CollectionV2 domain (name "Decentraland Collection", version "2") — same domain the gasless
// setApprovalForAll uses (see lib/authorizations metaTxContractData), only the address differs. This is
// the ONLY path that works for managed (Magic/thirdweb) wallets, which hold no gas.
async function transferViaMetaTransaction(opts: {
  contractAddress: string
  chainId: number
  from: string
  to: string
  tokenId: string
  signer: ethers.providers.JsonRpcSigner
}): Promise<string> {
  const { contractAddress, chainId, from, to, tokenId, signer } = opts
  const collection: ContractData = {
    ...getContract(ContractName.ERC721CollectionV2, chainId),
    address: contractAddress
  }
  const functionData = new ethers.utils.Interface(ERC721_TRANSFER_ABI).encodeFunctionData('transferFrom', [
    from,
    to,
    tokenId
  ])
  const rpc = readProvider()
  const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
  const txHash = await sendMetaTransaction(provider, rpc, functionData, collection, {
    serverURL: gaslessConfig.relayerUrl
  })
  await rpc.waitForTransaction(txHash, 1, 120_000)
  return txHash
}

/**
 * Transfer an owned collectible to another address. GASLESS FOR ALL (mirrors cancelListing): the relayer
 * submits + pays gas, so managed wallets (no POL) can transfer too, and it sidesteps the wallet's flaky
 * chain RPC. Falls back to a direct (gas-paying) tx only if the relayer is off/unreachable — but a user
 * rejection propagates instead of silently retrying with a gas tx. Returns the tx hash.
 */
export async function transferItem(opts: {
  contractAddress: string
  chainId: number
  tokenId: string
  to: string
  signer: ethers.Signer
}): Promise<string> {
  const { contractAddress, chainId, tokenId, to, signer } = opts
  const from = (await signer.getAddress()).toLowerCase()

  if (gaslessConfig.enabled) {
    try {
      return await transferViaMetaTransaction({
        contractAddress,
        chainId,
        from,
        to,
        tokenId,
        signer: signer as ethers.providers.JsonRpcSigner
      })
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      console.warn('[transferItem] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  // Direct (gas-paying) fallback. transferFrom is a REAL transaction, so it must run on the collection's
  // chain — a restored session can leave the wallet on whatever network it last used; switch just-in-time.
  await ensureChain(signer.provider as ethers.providers.Web3Provider, chainId)
  const contract = new ethers.Contract(contractAddress, ERC721_TRANSFER_ABI, signer) as ethers.Contract & {
    transferFrom(
      from: string,
      to: string,
      tokenId: string,
      overrides?: ethers.Overrides
    ): Promise<ethers.ContractTransaction>
  }
  const tx = await contract.transferFrom(from, to, tokenId, amoyGasOverrides(chainId))
  const receipt = await tx.wait()
  return receipt.transactionHash
}

export async function cancelListing(opts: { trade: Trade; signer: ethers.Signer }): Promise<string> {
  const { trade, signer } = opts
  const seller = (await signer.getAddress()).toLowerCase()

  // GASLESS FOR ALL (mirrors setAuthorization): relayer submits + pays gas, and it sidesteps the
  // wallet's chain RPC. Fall back to a direct tx if the relayer is off/unreachable — but let a user
  // rejection propagate instead of silently retrying with a gas-paying tx.
  if (gaslessConfig.enabled) {
    try {
      return await cancelViaMetaTransaction(trade, signer as ethers.providers.JsonRpcSigner, seller)
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      console.warn('[cancelListing] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  // Direct (gas-paying) fallback. cancelSignature is a REAL transaction, so it must run on the trade's
  // chain — a restored session can leave the wallet on whatever network it last used; switch just-in-time.
  await ensureChain(signer.provider as ethers.providers.Web3Provider, trade.chainId)
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const onChainTrade = getOnChainTrade(trade, seller)
  const contract = new ethers.Contract(marketplace.address, marketplace.abi, signer) as MarketplaceContract
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
  /**
   * Fired the moment the transaction is BROADCAST — the buyer confirmed and it is on its way.
   *
   * A caller that releases its reservation on ANY failure gives back money that is already spent: the
   * balance rises, the reconciler debits it again once the squid indexes the consumption, and anything
   * bought in the gap drives the balance negative. This is the only signal that says the release is no
   * longer safe. (`buyManyWithCredits` reports the same thing per group.)
   */
  onBroadcast?: (info: { txHash: string }) => void
  /**
   * Fired when the transaction mined and REVERTED (receipt status 0).
   *
   * A revert rolls the whole call back, so the credit was NOT consumed: releasing is safe and correct, and
   * NOT releasing strands that much of the buyer's balance until the TTL expires. This is the one failure
   * after a broadcast where a release is still right, which is why it is reported rather than guessed —
   * every other post-broadcast failure (timeout, dropped socket, replaced transaction) may be consumed.
   *
   * Carries the reverted transaction's hash because a credit can back MORE than one transaction: the modals
   * let a buyer retry with the same reservation, so "a revert happened" is not the same statement as "this
   * credit is untouched". See lib/spend-guard.
   */
  onReverted?: (info: { txHash: string | null }) => void
}): Promise<string> {
  const { trade, buyer, signer, credits, onBroadcast, onReverted } = opts
  if (credits.length === 0) throw new Error('No credits to spend')

  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const maxCreditedValue = opts.maxCreditedValue ?? (await tradeManaPriceWei(trade))
  const args = buildUseCreditsArgs(marketplace.address, marketplace.abi, [trade], buyer, credits, maxCreditedValue)
  try {
    return await sendUseCredits(trade.chainId, args, signer, txHash => onBroadcast?.({ txHash }))
  } catch (err) {
    // The hash of the transaction that reverted, so the caller can tie the revert to the attempt it belongs
    // to rather than to the credit as a whole. ethers attaches the receipt to the error; `null` if it somehow
    // is not there, which a caller must read as "this attempt is unresolved".
    if (isRevertedTxError(err)) {
      onReverted?.({ txHash: (err as { receipt?: { transactionHash?: string } }).receipt?.transactionHash ?? null })
    }
    throw err
  }
}

/**
 * Buy several listings in as few signatures as possible.
 *
 * Every trade on the same marketplace is fulfilled by ONE accept([...]) inside a single useCredits()
 * (one signature/tx), spending one ephemeral credit per item; every CollectionStore mint likewise collapses
 * into ONE buy([...]). See `groupPurchases` for why a mixed basket cannot be a single call. The
 * CreditsManager consumes each credit for its own item and settlement stays per-item (the squid records
 * consumption per credit id = intent salt). Returns the tx hash(es), in group order.
 *
 * Caveat: the CreditsManager caps the credited MANA per call at the hourly limit; a very large basket
 * could exceed it and revert (ExternalCallFailed). Fine for demo-scale baskets.
 */
/**
 * Did this failure come from a transaction that MINED AND REVERTED?
 *
 * ethers v5 rejects `tx.wait()` on a status-0 receipt, attaching that receipt to the error. Status 0 means the
 * EVM rolled the call back, so no credit was consumed — the reservation can and should be released.
 *
 * Deliberately narrow: it must answer NO for a timeout, an RPC drop, a replaced transaction, or anything else
 * that merely failed to OBSERVE the outcome, because those may still be consumed. The asymmetry is what makes
 * that the right default — releasing a consumed credit corrupts the buyer's balance, while failing to release
 * an unconsumed one only strands it until the TTL expires. `buy-gasless.ts` draws the same three-way
 * distinction (confirmed / reverted / still-pending) for relayed transactions.
 */
export function isRevertedTxError(err: unknown): boolean {
  return (err as { receipt?: { status?: number } } | null)?.receipt?.status === 0
}

export async function buyManyWithCredits(opts: {
  purchases: MixedPurchases
  buyer: string
  signer: ethers.Signer
  /**
   * Fired each time the buyer confirms one group in their wallet, before that group settles on-chain.
   * `signed` counts confirmations so far and `total` the number this basket needs — a self-custody buyer
   * facing two prompts needs to see which one they are on.
   */
  onSigned?: (signed: number, total: number) => void
  /**
   * Fired the moment a group's transaction is BROADCAST, with the credits it spends.
   *
   * This exists so a caller can tell what survived a failure. A mixed basket needs one transaction per group,
   * so the buyer can confirm the first and reject the second — and by then the first is irreversibly on its
   * way. Releasing its reservations (which is what a naive catch-all does) hands the buyer back money they
   * have already spent: the balance goes up, the reconciler debits it again when the squid indexes the
   * consumption, and anything spent in between drives the balance negative.
   *
   * The salts are the credit ids the server reserved, which is exactly what a release call takes — so the
   * caller can subtract them rather than having to map groups back to reservations itself.
   */
  onBroadcast?: (info: { txHash: string; salts: string[] }) => void
  /**
   * Fired when a group's transaction MINED SUCCESSFULLY (receipt status 1), with the credits it spent.
   *
   * Broadcast and settled are different facts and a caller needs both. Broadcast answers "may I release these
   * reservations?" (no — they may still be consumed). Only settled answers "does the buyer own these items?",
   * which is what decides whether a line leaves the cart. Treating broadcast as ownership takes items out of
   * the cart of someone whose transaction reverted and never bought anything.
   */
  onSettled?: (info: { txHash: string; salts: string[] }) => void
  /**
   * Fired when a group's transaction mined and REVERTED (receipt status 0), with the credits it did not spend.
   *
   * A revert changes no state, so those credits were NOT consumed and releasing their reservations is both
   * safe and correct — leaving them pending strands that much of the buyer's balance until the TTL expires.
   * This is the one case where a caller may release something it has already broadcast, and it is why the
   * distinction is reported rather than inferred: every OTHER failure after a broadcast (timeout, dropped
   * socket, replaced transaction) may still be consumed and must be left alone.
   */
  onReverted?: (info: { salts: string[] }) => void
}): Promise<string[]> {
  const { buyer, signer, onSigned, onBroadcast, onSettled, onReverted } = opts
  const purchases = normalizePurchases(opts.purchases)
  if (purchases.length === 0) throw new Error('No items to buy')

  const groups = groupPurchases(purchases)
  const hashes: string[] = []
  for (const group of groups) {
    const credits = group.purchases.flatMap(p => p.credits)
    const maxCreditedValue = groupMaxCreditedValue(group.purchases)
    const args =
      group.kind === 'store'
        ? buildStoreUseCreditsArgs(
            getContract(ContractName.CollectionStore, group.chainId).address,
            getContract(ContractName.CollectionStore, group.chainId).abi,
            group.purchases.map(p => p.item),
            buyer,
            credits,
            maxCreditedValue
          )
        : buildUseCreditsArgs(
            getContract(getContractName(group.marketplace), group.chainId).address,
            getContract(getContractName(group.marketplace), group.chainId).abi,
            group.purchases.map(p => p.trade),
            buyer,
            credits,
            maxCreditedValue
          )
    const salts = credits.map(c => c.id)
    let hash: string
    try {
      hash = await sendUseCredits(group.chainId, args, signer, txHash => {
        onSigned?.(hashes.length + 1, groups.length)
        // Reported from INSIDE the broadcast callback rather than after the await, because the await is on the
        // receipt: a group whose transaction was submitted and then failed to mine (timeout, RPC drop) has
        // still spent its credits, and its reservations must not be released either.
        onBroadcast?.({ txHash, salts })
      })
    } catch (err) {
      // A definitive revert is the ONE post-broadcast failure whose credits are provably untouched. Reported
      // here, next to the send, so the caller does not have to know how ethers reports a failed receipt.
      if (isRevertedTxError(err)) onReverted?.({ salts })
      throw err
    }
    hashes.push(hash)
    // Receipt in hand with status 1 (ethers rejects wait() otherwise), so this group is bought.
    onSettled?.({ txHash: hash, salts })
  }
  return hashes
}
