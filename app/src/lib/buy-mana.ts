import { ethers } from 'ethers'
import { type Trade } from '@dcl/schemas'
import {
  ContractName,
  ErrorCode,
  MetaTransactionError,
  getContract,
  getContractName,
  sendMetaTransaction
} from 'decentraland-transactions'
import { AuthorizationKind, ensureAuthorization, metaTxProviderShim, readProvider } from '~/lib/authorizations'
import { buyWithCredits, type SpendableCredit } from '~/lib/buy'
import { gaslessConfig } from '~/lib/gasless-config'
import { requireChain } from '~/lib/network'
import { amoyGasOverrides, buildStoreItemsToBuy, getOnChainTrade, type StoreItemToBuy } from '~/lib/trade-encoding'
import { confirmMetaTx, MetaTxPendingError } from '~/lib/tx-confirm'

type MarketplaceAcceptContract = ethers.Contract & {
  accept(trades: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

type CollectionStoreBuyContract = ethers.Contract & {
  buy(itemsToBuy: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

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
}): Promise<string> {
  const [hash] = await buyManyWithMana({ ...opts, trades: [opts.trade] })
  return hash
}

/**
 * Buy a whole CART with MANA — the MANA-only rail for a basket. Trades on the same marketplace settle
 * in ONE accept([...]) (one signature/tx), mirroring how buyManyWithCredits batches the credits rail;
 * trades on different marketplaces split into one tx each. No credits are spent, so nothing is
 * authorized or reserved. Returns the tx hash(es).
 */
export async function buyManyWithMana(opts: {
  trades: Trade[]
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  onSigned?: () => void
}): Promise<string[]> {
  const { trades, buyer, signer, onSigned } = opts
  if (trades.length === 0) throw new Error('No items to buy')

  // Group by (chain, marketplace) so each group is one accept([...]).
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const key = `${t.chainId}:${t.contract.toLowerCase()}`
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }

  const hashes: string[] = []
  for (const group of groups.values()) {
    hashes.push(await acceptPayingMana({ trades: group, buyer, signer, onSigned }))
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
}): Promise<string> {
  const { trades, buyer, signer, onSigned } = opts
  const trade = trades[0] // same chain + marketplace across the group
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const mana = getContract(ContractName.MANAToken, trade.chainId)

  // 1. Approve the marketplace to spend the buyer's MANA (gasless; no-op if already approved).
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: marketplace.address,
      chainId: trade.chainId
    },
    signer
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
      console.warn('[buyWithMana] gasless meta-tx failed, falling back to a direct tx:', e)
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

/**
 * Mint items from a collection's store paying MANA DIRECTLY — the MANA rail for PRIMARY items.
 *
 * A mint is not a listing: it has no trade, so `accept([...])` cannot fulfil it and every MANA path above
 * is unusable. The Shop's answer until now was to offer no MANA rail at all for a basket containing a
 * mint, which meant a buyer holding MANA was sent to buy credits with a card instead — for most of the
 * catalogue, since primaries are what creators publish.
 *
 * `CollectionStore.buy([...])` is the same call the credits rail already makes; the only difference is
 * who sends it. Through the CreditsManager the manager is `msg.sender` and the credits pay. Called
 * directly, the BUYER is `msg.sender` and the store pulls their MANA — which is exactly the legacy
 * marketplace's flow, and why the allowance below targets the store rather than a marketplace.
 *
 * GASLESS FIRST, like every other rail here: the CollectionStore is a native meta-transaction contract
 * (verified on-chain — it answers `getNonce`), so a managed wallet holding no POL can mint with MANA too.
 * `decentraland-transactions` does not list `executeMetaTransaction` in the store's ABI, which only
 * selects which of the two signing shapes it uses; the nonce is read from the chain either way.
 *
 * The fallback is the same contract with the wallet paying gas, and it is deliberately gated on
 * `requireChain`: that CHECKS the wallet's network and throws WrongNetworkError rather than switching it,
 * so moving networks stays the buyer's own decision (see lib/network).
 *
 * One call mints the whole batch, so a cart of primaries is one signature.
 */
export async function buyMintsWithMana(opts: {
  items: StoreItemToBuy[]
  chainId: number
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  /** Fired once the buyer confirms in their wallet, before on-chain settlement (UI: "completing…"). */
  onSigned?: () => void
}): Promise<string> {
  const { items, chainId, buyer, signer, onSigned } = opts
  if (items.length === 0) throw new Error('No items to buy')

  const store = getContract(ContractName.CollectionStore, chainId)
  const mana = getContract(ContractName.MANAToken, chainId)

  // 1. Let the STORE pull the buyer's MANA. Same helper the other rails use; only the spender differs.
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: store.address,
      chainId
    },
    signer
  })

  const itemsToBuy = buildStoreItemsToBuy(items, buyer)

  // 2. Mint, paying MANA: CollectionStore.buy([...items]).
  if (gaslessConfig.enabled) {
    try {
      const functionData = new ethers.utils.Interface(store.abi).encodeFunctionData('buy', [itemsToBuy])
      const rpc = readProvider()
      const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
      const txHash = await sendMetaTransaction(provider, rpc, functionData, store, {
        serverURL: gaslessConfig.relayerUrl
      })
      onSigned?.()
      await confirmMetaTx(txHash, 'the MANA mint')
      return txHash
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      // Same rule as the trade rail: a PENDING meta-tx must never fall through. Pending means no receipt
      // yet, so the relayed mint may still land — minting again directly would buy the item TWICE and
      // charge the buyer twice. A revert consumed nothing, so retrying that one is safe.
      if (e instanceof MetaTxPendingError) throw e
      console.warn('[buyMintsWithMana] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  // Direct (gas-paying) fallback. The WALLET broadcasts, so it must already be on the mint's chain — we
  // only CHECK; moving it is the buyer's decision, surfaced by the caller from WrongNetworkError.
  await requireChain(signer.provider as ethers.providers.Web3Provider, chainId)
  const contract = new ethers.Contract(store.address, store.abi, signer) as CollectionStoreBuyContract
  const tx = await contract.buy(itemsToBuy, amoyGasOverrides(chainId))
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
   * Forwarded to buyWithCredits, which settles this rail. The caller needs them for the same reason the
   * credits-only rail does: this spends an ephemeral credit through `useCredits`, so once the transaction is
   * broadcast that credit may be consumed and its reservation must not be released.
   */
  onBroadcast?: (info: { txHash: string }) => void
  onReverted?: (info: { txHash: string | null }) => void
}): Promise<string> {
  const { trade, buyer, signer, credits, manaGapWei, onBroadcast, onReverted } = opts
  if (credits.length === 0) throw new Error('No credits to spend — use buyWithMana for a MANA-only purchase')
  if (manaGapWei <= 0n) throw new Error('No MANA gap to cover — use buyWithCredits for a credits-only purchase')

  const mana = getContract(ContractName.MANAToken, trade.chainId)
  const creditsManager = getContract(ContractName.CreditsManager, trade.chainId)

  // Let the CreditsManager pull the MANA leg (gasless; no-op when already approved).
  await ensureAuthorization({
    auth: {
      kind: AuthorizationKind.Allowance,
      contractAddress: mana.address,
      spenderAddress: creditsManager.address,
      chainId: trade.chainId
    },
    signer
  })

  // maxCreditedValue = the credits' value + the MANA gap, so the contract's uncredited leg is the gap.
  const creditsValue = credits.reduce((acc, c) => acc + BigInt(c.availableAmount), 0n)
  const maxCreditedValue = (creditsValue + manaGapWei).toString()

  return buyWithCredits({ trade, buyer, signer, credits, maxCreditedValue, onBroadcast, onReverted })
}
