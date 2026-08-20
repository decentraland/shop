import { ethers } from 'ethers'
import { type ChainId, type ProviderType, type Trade } from '@dcl/schemas'
import {
  ContractName,
  ErrorCode,
  MetaTransactionError,
  getContract,
  getContractName,
  sendMetaTransaction
} from 'decentraland-transactions'
import { AuthorizationKind, ensureAuthorization, metaTxProviderShim, readProvider } from '~/lib/authorizations'
import { buyOneWithCredits, type AnyPurchase, type SpendableCredit } from '~/lib/buy'
import { buyOneGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { gaslessConfig } from '~/lib/gasless-config'
import { captureError } from '~/lib/monitoring'
import { requireChain } from '~/lib/network'
import { canPayGasItself } from '~/lib/wallet-kind'
import {
  amoyGasOverrides,
  encodeStoreBuy,
  getOnChainTrade,
  itemsToBuyArg,
  type StoreItemToBuy
} from '~/lib/trade-encoding'
import { confirmMetaTx, MetaTxPendingError } from '~/lib/tx-confirm'

type MarketplaceAcceptContract = ethers.Contract & {
  accept(trades: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

type CollectionStoreContract = ethers.Contract & {
  buy(items: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

/**
 * A CollectionStore mint as the MANA rails need it: what to mint, at the price the contract will verify, on
 * the chain that holds the collection. The mint counterpart to a `Trade` here — a mint has no signed order, so
 * the chain id travels with it instead of coming off one.
 */
export type MintToBuy = {
  item: StoreItemToBuy
  chainId: number
}

/**
 * What a purchase settles as, for the rails that accept either kind. A mint is not a trade and never gets one,
 * so every function below that can be handed both branches on this rather than on a possibly-absent `trade`.
 */
export type PurchaseTarget = { kind: 'trade'; trade: Trade } | { kind: 'store'; mint: MintToBuy }

/**
 * Buy a listed NFT by paying MANA DIRECTLY — the alternative to the credits rail for users who already
 * hold MANA. Reuses the shop's existing on-chain machinery instead of reinventing settlement:
 *
 *   1. ensureAuthorization(ALLOWANCE) lets the marketplace pull the buyer's MANA (gasless meta-tx for
 *      every wallet, no-op when already approved) — the same allowance helper the Authorizations page
 *      and credit top-ups use, only the SPENDER is the marketplace (not the CreditsManager).
 *   2. marketplace.accept([trade]) fulfils the trade: the marketplace transfers MANA buyer→seller (for
 *      a USD_PEGGED_MANA trade it reads its own oracle at settlement to size the exact MANA) and the
 *      NFT seller→buyer. This is the classic offchain-marketplace fulfilment the CreditsManager wraps
 *      in useCredits(); paying in MANA just calls it directly, so the buyer's MANA settles the sale.
 *
 * GASLESS FOR ALL (mirrors cancelListing / transferItem): the buyer signs an off-chain meta-tx and
 * DCL's relayer submits it + pays gas, so managed (Magic/thirdweb) wallets — which hold no POL — can
 * pay with MANA too. Falls back to a direct (gas-paying) accept only if the relayer is off/unreachable;
 * a user rejection propagates instead of silently retrying. Returns the tx hash.
 *
 * WHY NOT THROUGH THE CREDITSMANAGER: every other purchase in the shop settles via
 * CreditsManager.useCredits(), and a MANA-only one cannot — useCredits() reverts with `NoCredits()` when
 * handed an empty credit array, so there is no way to route a zero-credit purchase through it. The mixed
 * rail DOES go through it (see buyWithCreditsAndMana below), which is why the two rails approve DIFFERENT
 * spenders: the marketplace here, the CreditsManager there.
 */
export async function buyWithMana(opts: {
  trade: Trade
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  /** Fired once the buyer confirms in their wallet, before on-chain settlement (UI: "completing…"). */
  onSigned?: () => void
  /** The trade's MANA price — what the allowance must cover. See buyManyWithMana. */
  manaWei?: bigint
}): Promise<string> {
  const [hash] = await buyManyWithMana({ ...opts, trades: [opts.trade] })
  return hash
}

/**
 * Pay for a CollectionStore MINT in MANA — the mint's answer to `buyWithMana`, and the reason a mint offers
 * the same payment choices a listing does.
 *
 * Same two steps, one contract over: approve the STORE to pull the buyer's MANA (the marketplace never sees a
 * mint), then call `buy([item])` with the buyer as the beneficiary. The store re-validates the price against
 * the item's live on-chain price, which is why `priceWei` is read as late as possible upstream.
 */
export async function buyMintWithMana(opts: {
  mint: MintToBuy
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  onSigned?: () => void
  /** The mint's MANA price — what the allowance must cover. Derived from the item when omitted. */
  manaWei?: bigint
}): Promise<string> {
  const [hash] = await buyManyWithMana({ ...opts, trades: [], mints: [opts.mint] })
  return hash
}

/**
 * Buy a whole CART with MANA — the MANA-only rail for a basket. Trades on the same marketplace settle
 * in ONE accept([...]) (one signature/tx), mirroring how buyManyWithCredits batches the credits rail;
 * trades on different marketplaces split into one tx each. CollectionStore mints collapse the same way,
 * into one `buy([...])` per chain. No credits are spent, so nothing is authorized or reserved. Returns the
 * tx hash(es).
 *
 * A basket mixing the two therefore costs one signature per kind, exactly as the credits rail does (see
 * `groupPurchases`) — the two settle through different contracts and neither call can carry the other.
 */
export async function buyManyWithMana(opts: {
  trades: Trade[]
  /** CollectionStore mints in the basket. Absent for a trade-only one. */
  mints?: MintToBuy[]
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  onSigned?: () => void
  /**
   * What this purchase will pull in MANA — the amount the allowance has to cover, and the same figure the
   * UI announced its approval step with, so the grant can never disagree with what the buyer was told.
   * Omitted, the allowance is only checked for EXISTENCE and one left over from a cheaper purchase lets
   * settlement revert on transferFrom.
   */
  manaWei?: bigint
}): Promise<string[]> {
  const { trades, mints = [], buyer, signer, onSigned, manaWei } = opts
  if (trades.length === 0 && mints.length === 0) throw new Error('No items to buy')

  // Group by (chain, marketplace) so each group is one accept([...]).
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const key = `${t.chainId}:${t.contract.toLowerCase()}`
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }

  // Mints group by chain alone: one CollectionStore per chain, and its `buy` takes items across collections.
  const mintGroups = new Map<number, MintToBuy[]>()
  for (const m of mints) {
    const g = mintGroups.get(m.chainId)
    if (g) g.push(m)
    else mintGroups.set(m.chainId, [m])
  }

  const hashes: string[] = []
  for (const group of groups.values()) {
    hashes.push(await acceptPayingMana({ trades: group, buyer, signer, onSigned, requiredManaWei: manaWei }))
  }
  for (const [chainId, group] of mintGroups) {
    // A mint carries the price the contract will verify, so its allowance can be sized exactly even when
    // the caller passes nothing — a trade's cannot (a USD-pegged one is priced by the oracle at settlement).
    const requiredManaWei = manaWei ?? group.reduce((sum, m) => sum + BigInt(m.item.priceWei), 0n)
    hashes.push(await mintPayingMana({ mints: group, chainId, buyer, signer, onSigned, requiredManaWei }))
  }
  return hashes
}

// One accept([...]) settled with the buyer's MANA: approve the marketplace, then submit (gasless first,
// direct tx as the fallback). Shared by the single-item and cart rails.
async function acceptPayingMana(opts: {
  trades: Trade[]
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  onSigned?: () => void
  requiredManaWei?: bigint
}): Promise<string> {
  const { trades, buyer, signer, onSigned, requiredManaWei } = opts
  const trade = trades[0] // same chain + marketplace across the group
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const mana = getContract(ContractName.MANAToken, trade.chainId)

  // 1. Approve the marketplace to spend the buyer's MANA (gasless; no-op when the allowance already covers
  //    this purchase — sized to it, because a leftover allowance from a cheaper one reverts accept()).
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: marketplace.address,
      chainId: trade.chainId
    },
    signer,
    requiredWei: requiredManaWei
  })

  const onChainTrades = trades.map(t => getOnChainTrade(t, buyer))

  // 2. Fulfil the trade paying MANA directly: marketplace.accept([trade]).
  if (gaslessConfig.enabled) {
    try {
      const functionData = new ethers.utils.Interface(marketplace.abi).encodeFunctionData('accept', [onChainTrades])
      const rpc = readProvider()
      const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
      const txHash = await sendMetaTransaction(provider, rpc, functionData, marketplace, {
        serverURL: gaslessConfig.relayerUrl
      })
      // Broadcast (the buyer signed) — flip the UI to "completing…" before we wait for the receipt.
      onSigned?.()
      await confirmMetaTx(txHash, 'the MANA purchase')
      return txHash
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      // A PENDING meta-tx must NOT fall through to the direct path. Pending means no receipt yet, so the
      // relayed transaction may still mine — re-submitting the purchase directly would run it TWICE.
      // A revert is different: it consumed nothing, so retrying directly is right. Propagate the pending
      // one and let the caller surface it; an unknown outcome is not a failure to paper over.
      if (e instanceof MetaTxPendingError) throw e
      // The fallback below is what makes a wrong-network refusal reachable AT ALL: the relayed rail works
      // from any chain, so a buyer only ever meets `requireChain` because this relay already failed. Left
      // as a console.warn, that first failure was invisible and every WrongNetworkError in Sentry was a
      // symptom whose cause had no record.
      captureError(e, { flow: 'buy_mana', step: 'gasless_fallback' })
    }
  }

  // Direct (gas-paying) fallback: the WALLET broadcasts this one, so it must already be on the trade's
  // chain. We only CHECK — moving the wallet is the user's own decision (the navbar's network control),
  // never a side effect of clicking this. See lib/network.
  await requireChain(signer.provider as ethers.providers.Web3Provider, trade.chainId)
  const contract = new ethers.Contract(marketplace.address, marketplace.abi, signer) as MarketplaceAcceptContract
  const tx = await contract.accept(onChainTrades, amoyGasOverrides(trade.chainId))
  onSigned?.()
  const receipt = await tx.wait()
  return receipt.transactionHash
}

// One CollectionStore buy([...]) settled with the buyer's MANA. Step for step the same shape as
// acceptPayingMana above — approve the spender, relay a meta-tx, fall back to a direct tx — with the STORE as
// both the spender and the target, because a mint is not a listing and the marketplace has no part in it.
async function mintPayingMana(opts: {
  mints: MintToBuy[]
  chainId: number
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  onSigned?: () => void
  requiredManaWei?: bigint
}): Promise<string> {
  const { mints, chainId, buyer, signer, onSigned, requiredManaWei } = opts
  const store = getContract(ContractName.CollectionStore, chainId)
  const mana = getContract(ContractName.MANAToken, chainId)
  const items = mints.map(m => m.item)

  // 1. Approve the store to spend the buyer's MANA (gasless; no-op when the allowance already covers this
  //    mint — sized to it, because a leftover allowance from a cheaper one reverts buy()).
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: store.address,
      chainId
    },
    signer,
    requiredWei: requiredManaWei
  })

  // 2. Mint, paying MANA directly: CollectionStore.buy([...items]) with the buyer as the beneficiary.
  if (gaslessConfig.enabled) {
    try {
      const functionData = encodeStoreBuy(items, buyer, store.abi)
      const rpc = readProvider()
      const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
      const txHash = await sendMetaTransaction(provider, rpc, functionData, store, {
        serverURL: gaslessConfig.relayerUrl
      })
      onSigned?.()
      await confirmMetaTx(txHash, 'the MANA purchase')
      return txHash
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      // A pending relay must not be re-submitted directly — it may still mine, and minting twice charges
      // twice. Same rule as acceptPayingMana.
      if (e instanceof MetaTxPendingError) throw e
      captureError(e, { flow: 'buy_mint_mana', step: 'gasless_fallback' })
    }
  }

  await requireChain(signer.provider as ethers.providers.Web3Provider, chainId)
  const contract = new ethers.Contract(store.address, store.abi, signer) as CollectionStoreContract
  const tx = await contract.buy(itemsToBuyArg(items, buyer), amoyGasOverrides(chainId))
  onSigned?.()
  const receipt = await tx.wait()
  return receipt.transactionHash
}

/**
 * Buy a listing paying with CREDITS FIRST and covering the remainder in MANA — one signature, one tx.
 *
 * This is the CreditsManager's own mixed-payment rail, not a second settlement path: useCredits()
 * takes a `maxUncreditedValue`, the MANA the buyer covers out of pocket when the credits don't reach
 * the price. The contract pulls that MANA up front, runs accept([trade]), and refunds whatever it
 * didn't need — so an over-estimated gap costs the buyer nothing.
 *
 * Two things make it work:
 *   • The credit is sized to the buyer's BALANCE (not the item price) by the credits-server, so its
 *     value is short of the trade — the gap is exactly what MANA must cover.
 *   • maxCreditedValue is set to `credits + gap`, which is how buildUseCreditsArgs derives
 *     maxUncreditedValue = gap.
 *
 * The MANA allowance points at the CREDITSMANAGER here (the marketplace never touches the buyer's
 * MANA in this rail) — the same account-level 'credits' allowance the top-up flow grants, so a buyer
 * who has ever used credits is already approved. Contrast buyWithMana above, which approves the
 * MARKETPLACE because it calls accept() directly.
 *
 * Note this rail CANNOT be used for a pure-MANA purchase: useCredits reverts with NoCredits() when
 * given an empty credits array, which is why buyWithMana exists.
 *
 * A MINT rides the exact same rail (`buyMintWithCreditsAndMana`): the external call inside `useCredits` is
 * `buy([item])` instead of `accept([trade])`, and everything about the money — the allowance, the credit
 * sizing, the uncredited leg — is unchanged.
 */
export async function buyWithCreditsAndMana(opts: {
  trade: Trade
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  /** The ephemeral credit(s) the server signed, sized to the buyer's credit balance. */
  credits: SpendableCredit[]
  /** MANA (wei) the buyer covers out of pocket. MUST be <= their balance; unused MANA is refunded. */
  manaGapWei: bigint
  /**
   * Who the buyer signs with, and therefore whether the gas-paying fallback is a route they have at all.
   * Omitted reads as managed — the safe default, since offering gas to a wallet that holds none is the
   * failure this rail already produced.
   */
  providerType?: ProviderType | null
  /**
   * Forwarded to the credits rail, which settles this one. The caller needs them for the same reason the
   * credits-only rail does: this spends an ephemeral credit through `useCredits`, so once the transaction is
   * broadcast that credit may be consumed and its reservation must not be released.
   */
  onBroadcast?: (info: { txHash: string }) => void
  onReverted?: (info: { txHash: string | null }) => void
  /**
   * The relayer gave no usable answer, so the meta-tx MAY have been broadcast. The reservation can never be
   * released on this outcome — there is no hash to check it against.
   */
  onUnobservable?: () => void
}): Promise<string> {
  const { trade, ...rest } = opts
  return payGapWithMana({ target: { kind: 'trade', trade }, ...rest })
}

/** Pay for a MINT with credits first and MANA for the remainder — `buyWithCreditsAndMana` for a store item. */
export async function buyMintWithCreditsAndMana(opts: {
  mint: MintToBuy
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  credits: SpendableCredit[]
  manaGapWei: bigint
  providerType?: ProviderType | null
  onBroadcast?: (info: { txHash: string }) => void
  onReverted?: (info: { txHash: string | null }) => void
  onUnobservable?: () => void
}): Promise<string> {
  const { mint, ...rest } = opts
  return payGapWithMana({ target: { kind: 'store', mint }, ...rest })
}

async function payGapWithMana(opts: {
  target: PurchaseTarget
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  credits: SpendableCredit[]
  manaGapWei: bigint
  providerType?: ProviderType | null
  onBroadcast?: (info: { txHash: string }) => void
  onReverted?: (info: { txHash: string | null }) => void
  onUnobservable?: () => void
}): Promise<string> {
  const { target, buyer, signer, credits, manaGapWei, providerType, onBroadcast, onReverted, onUnobservable } = opts
  if (credits.length === 0) throw new Error('No credits to spend — use the MANA-only rail for that')
  if (manaGapWei <= 0n) throw new Error('No MANA gap to cover — use the credits-only rail for that')

  const chainId = targetChainId(target)
  const mana = getContract(ContractName.MANAToken, chainId)
  const creditsManager = getContract(ContractName.CreditsManager, chainId)

  // Let the CreditsManager pull the MANA leg (gasless; no-op when the allowance already covers the gap).
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: creditsManager.address,
      chainId
    },
    signer,
    requiredWei: manaGapWei
  })

  // maxCreditedValue = the credits' value + the MANA gap, so the contract's uncredited leg is the gap.
  const creditsValue = credits.reduce((acc, c) => acc + BigInt(c.availableAmount), 0n)
  const maxCreditedValue = (creditsValue + manaGapWei).toString()

  const purchase = purchaseFor(target, credits, maxCreditedValue)

  /**
   * RELAYED FIRST, like both sibling rails — this one used to go straight to the buyer's own transaction.
   *
   * `buyOneGasless` is the relayed counterpart of the `buyOneWithCredits` below and takes the same
   * `AnyPurchase`, so this rail was the only one that never called it. The cost of that omission was paid by
   * managed (web2) wallets, which hold no POL: their purchase reached `sendTransaction` and died with
   * `insufficient funds ... balance 0` — the one outcome this shop exists to make impossible. It also made
   * the direct rail's `requireChain` reachable on a rail that never needs it, so the same buyer met a
   * wrong-network refusal for a transaction the relayer would have submitted from any network.
   */
  if (gaslessConfig.enabled) {
    let relayedHash: string | undefined
    try {
      relayedHash = await buyOneGasless({ purchase, buyer, signer })
      // The relayer has broadcast by the time this resolves, so the credits are spoken for from here.
      onBroadcast?.({ txHash: relayedHash })
      await waitForSettlement(relayedHash)
      return relayedHash
    } catch (e) {
      // A dismissed signature is an answer, not a reason to ask again for gas (see setAuthorization).
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      // No receipt YET is not a failure: the relayed transaction may still mine, and re-submitting would
      // run the purchase twice. The caller keeps the reservation and lets the reconciler settle it.
      if (e instanceof SettlementPendingError) throw e
      if (!(e instanceof GaslessUnavailableError)) {
        // Relayed, then mined a REVERT: nothing was consumed, so name the attempt that failed — without it
        // the caller cannot tell this apart from an unresolved one and the reservation stays stranded.
        if (relayedHash) onReverted?.({ txHash: relayedHash })
        throw e
      }
      /**
       * Only a REJECTION proves nothing was relayed. `relayer-unreachable` means there was no usable
       * response, so the meta-tx may have been submitted before the connection died — re-submitting
       * directly would spend the same credit twice. Record it as unobservable instead.
       */
      if (e.reason === 'relayer-unreachable') {
        onUnobservable?.()
        throw e
      }
      /**
       * The gas-paying fallback is a route only a SELF-CUSTODY wallet has. A managed wallet holds no POL, so
       * offering it produces `INSUFFICIENT_FUNDS` after a prompt the buyer cannot act on — and it is what put
       * this bug in front of a real buyer twice.
       */
      if (!canPayGasItself(providerType)) throw e
      captureError(e, { flow: 'buy_credits_and_mana', step: 'gasless_fallback' })
    }
  }

  return buyOneWithCredits({ purchase, buyer, signer, onBroadcast, onReverted })
}

/** The chain a purchase settles on: a trade carries it, a mint carries it alongside the item. */
export function targetChainId(target: PurchaseTarget): number {
  return target.kind === 'trade' ? target.trade.chainId : target.mint.chainId
}

/** The credits-rail purchase for either kind of target, paid by the given credits. */
export function purchaseFor(target: PurchaseTarget, credits: SpendableCredit[], maxCreditedValue: string): AnyPurchase {
  return target.kind === 'trade'
    ? { kind: 'trade', trade: target.trade, credits, maxCreditedValue }
    : { kind: 'store', item: target.mint.item, chainId: target.mint.chainId, credits, maxCreditedValue }
}

/**
 * Which contract has to be allowed to pull the buyer's MANA, per rail and per kind of purchase.
 *
 * Lives here, with the rails that spend it, because getting it wrong is an approval the buyer grants for
 * nothing followed by a failed purchase: MANA-only settles against the seller's own contract (the marketplace
 * for a listing, the store for a mint) while the mixed rail always settles through the CreditsManager. The UI
 * reads this to TELL a self-custody buyer about the approval before it happens, so it must be the same answer
 * the rail's own ensureAuthorization asks for.
 */
export function manaSpenderFor(
  rail: 'mana' | 'combined',
  target: PurchaseTarget
): { spender: string; chainId: ChainId } {
  const chainId = targetChainId(target)
  if (rail === 'combined') return { spender: getContract(ContractName.CreditsManager, chainId).address, chainId }
  const spender =
    target.kind === 'trade'
      ? getContract(getContractName(target.trade.contract), chainId).address
      : getContract(ContractName.CollectionStore, chainId).address
  return { spender, chainId }
}
