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
import {
  AuthorizationKind,
  ensureAuthorization,
  ensureChain,
  metaTxProviderShim,
  readProvider
} from '~/lib/authorizations'
import { buyWithCredits, type SpendableCredit } from '~/lib/buy'
import { gaslessConfig } from '~/lib/gasless-config'
import { amoyGasOverrides, getOnChainTrade } from '~/lib/trade-encoding'

type MarketplaceAcceptContract = ethers.Contract & {
  accept(trades: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
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
 * NOTE (combined credits + MANA — STRETCH, not built): the CreditsManager.useCredits() path already
 * supports a `maxUncreditedValue` — the MANA the buyer covers out of pocket when credits don't fully
 * pay. A combined payment would go through useCredits() (NOT this direct accept): size the credit leg,
 * set maxUncreditedValue to the MANA remainder, and keep the MANA allowance pointed at the
 * CreditsManager (getCreditsAuthorization) rather than the marketplace. See PaymentMethodStep for the
 * UI seam. Left out here on purpose so the two single-rail paths stay simple to reason about.
 */
export async function buyWithMana(opts: {
  trade: Trade
  buyer: string
  signer: ethers.providers.JsonRpcSigner
  /** Fired once the buyer confirms in their wallet, before on-chain settlement (UI: "completing…"). */
  onSigned?: () => void
}): Promise<string> {
  const { trade, buyer, signer, onSigned } = opts
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

  const onChainTrade = getOnChainTrade(trade, buyer)

  // 2. Fulfil the trade paying MANA directly: marketplace.accept([trade]).
  if (gaslessConfig.enabled) {
    try {
      const functionData = new ethers.utils.Interface(marketplace.abi).encodeFunctionData('accept', [[onChainTrade]])
      const rpc = readProvider()
      const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
      const txHash = await sendMetaTransaction(provider, rpc, functionData, marketplace, {
        serverURL: gaslessConfig.relayerUrl
      })
      // Broadcast (the buyer signed) — flip the UI to "completing…" before we wait for the receipt.
      onSigned?.()
      await rpc.waitForTransaction(txHash, 1, 120_000)
      return txHash
    } catch (e) {
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      console.warn('[buyWithMana] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  // Direct (gas-paying) fallback. accept is a REAL transaction, so it must run on the trade's chain —
  // a restored session can leave the wallet on another network; switch just-in-time (mirrors buy.ts).
  await ensureChain(signer.provider as ethers.providers.Web3Provider, trade.chainId)
  const contract = new ethers.Contract(marketplace.address, marketplace.abi, signer) as MarketplaceAcceptContract
  const tx = await contract.accept([onChainTrade], amoyGasOverrides(trade.chainId))
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
}): Promise<string> {
  const { trade, buyer, signer, credits, manaGapWei } = opts
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

  return buyWithCredits({ trade, buyer, signer, credits, maxCreditedValue })
}
