// Gasless checkout — the buyer signs ONLY an off-chain EIP-712 message; a relayer submits
// CreditsManager.executeMetaTransaction(...) and pays the gas.
//
// The useCredits calldata is built by lib/buy's buildGroupUseCreditsArgs — the SAME function the direct
// rail uses — and then wrapped in the Decentraland/Polygon native meta-transaction and POSTed to the
// relayer. Sharing the builder is deliberate: the two rails differ only in who transmits, so the bytes
// that move the money must come from one place.
//
// META-TX VERDICT: the deployed CreditsManagerPolygon (Amoy 0x8052…fb3) exposes
// executeMetaTransaction(address,bytes,bytes) + getNonce(address) — see shop/design/GASLESS_SPEC.md.
// No new contract / forwarder / upgrade is needed.
//
// The EIP-712 payload, domain, nonce read and calldata packing mirror
// decentraland-transactions' sendMetaTransaction() exactly (same types/selectors), but taking
// an explicit ethers Signer + a configurable relayer URL so it stays feature-flaggable.

import { ethers } from 'ethers'
import { type Trade } from '@dcl/schemas'
import { ContractName, ErrorCode, MetaTransactionError, getContract } from 'decentraland-transactions'
import { config } from '~/config'
import { captureError } from '~/lib/monitoring'
import { gaslessConfig } from '~/lib/gasless-config'
import { type SpendableCredit } from '~/lib/trade-encoding'
// The grouping and the per-group calldata live in ~/lib/buy so BOTH rails build the money call the same
// way. buy.ts does not import this module, so the dependency runs one way only.
import { buildGroupUseCreditsArgs, groupPurchases, type AnyPurchase, type MixedPurchases } from '~/lib/buy'
import { reportSubmittedTx } from '~/lib/purchase-report'

const { Interface, hexZeroPad } = ethers.utils

// Thrown when the gasless path can't run (flag off, contract account, relayer down). The caller
// catches this and falls back to buyWithCredits (buyer submits + pays gas) — see GASLESS_SPEC §6.
export class GaslessUnavailableError extends Error {
  constructor(
    message: string,
    /**
     * `relayer-rejected` vs `relayer-unreachable` is a MONEY distinction, not a diagnostic one.
     *
     * Rejected means a response was parsed and carried no hash: the meta-transaction was provably NOT
     * broadcast, so falling back to the direct rail with the same credit is safe. Unreachable means there is
     * no usable response — a proxy 502, a reset connection — and the relayer may well have submitted before
     * the connection died. Re-submitting the same credit then spends it twice from the caller's point of
     * view: gas estimation reverts on the already-consumed credit, no receipt comes back, and the failure
     * looks exactly like a pre-broadcast one to anything that cannot tell these two apart.
     */
    readonly reason:
      'disabled' | 'contract-account' | 'relayer-rejected' | 'relayer-unreachable' | 'unknown' = 'unknown'
  ) {
    super(message)
    this.name = 'GaslessUnavailableError'
  }
}

// Thrown when the relayer has ALREADY BROADCAST the meta-tx but it hasn't confirmed within the wait
// window (RPC timeout / still pending). This is NOT a failure: the tx may still mine, so the caller
// MUST keep the reserved USD intent (never cancelUsdIntents) — the credits-server reconciles it
// against the indexed CreditUsed event. Releasing here would let the buyer keep the credits AND get
// the item once the tx lands (double-spend). Carries the txHash for the optimistic success path.
export class SettlementPendingError extends Error {
  // `cause` set manually (not via the Error options arg) so we don't depend on the ES2022 lib target.
  constructor(
    readonly txHash: string,
    options?: { cause?: unknown }
  ) {
    super('Purchase not yet confirmed')
    this.name = 'SettlementPendingError'
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause
  }
}

// ---------------------------------------------------------------------------
// Meta-transaction: build EIP-712, get the buyer's off-chain signature, relay.
// The useCredits calldata is built by the shared lib/trade-encoding (byte-identical to lib/buy.ts).
// ---------------------------------------------------------------------------

// The offchain DCL meta-tx type (CreditsManager uses `functionData`, selector 0xd8ed1acc).
// The EIP712Domain type is implied by the `domain` object passed to ethers _signTypedData
// (name/version/verifyingContract/salt) — matching decentraland-transactions' DOMAIN_TYPE.
const OFFCHAIN_META_TRANSACTION_TYPE = [
  { name: 'nonce', type: 'uint256' },
  { name: 'from', type: 'address' },
  { name: 'functionData', type: 'bytes' }
]

// bytes32(chainId) — the DCL meta-tx domain salt.
function chainIdSalt(chainId: number): string {
  return hexZeroPad(ethers.utils.hexlify(chainId), 32)
}

/**
 * Report a relayer failure to Sentry.
 *
 * This flow's highest-signal failure produced nothing at all in Sentry: a refusal is an HTTP 400 the
 * caller turns into a typed error, never an uncaught exception, and the surrounding `ignoreErrors`
 * drops anything matching /denied|reject|cancel/i. A buyer on a Ledger hit the same refusal four
 * times in three minutes and the only trace anywhere was a 400 in the transactions-server's log; we
 * found out because she told someone.
 *
 * The relayer's message carries the decoded gas-estimation failure — for that buyer it held the
 * revert that identified the bug — so it is the single most useful field here.
 *
 * Both failure modes are reported, tagged with `reason`. `relayer-unreachable` is noisier — a flaky
 * network or an offline buyer looks the same as a relayer outage from here — but it is also the mode
 * where the meta-tx MAY have been broadcast before the connection died, so losing it is worse than
 * the noise. Separate the two when alerting on `reason`, not by dropping one at the source.
 */
function reportRelayerFailure(
  reason: 'relayer-rejected' | 'relayer-unreachable',
  message: string,
  buyer: string,
  target: string,
  httpStatus?: number
) {
  captureError(new Error(`gasless relay ${reason}: ${message}`), {
    // `flow`/`step` (and `http_status`) are the fields Sentry INDEXES as tags — see lib/monitoring's
    // `tagsFrom`. Named anything else, these would land in `extra`, which cannot be searched, grouped or
    // charted: the failure would be readable one event at a time and countable never. `reason` is the
    // step here because "which way did the relay fail" is exactly the facet worth splitting on.
    flow: 'gasless_relay',
    step: reason,
    relayerMessage: message,
    buyer,
    target,
    http_status: httpStatus
  })
}

// executeMetaTransaction(address _userAddress, bytes _functionData, bytes _signature) calldata.
function encodeExecuteMetaTransaction(
  cmAbi: unknown[],
  buyer: string,
  functionData: string,
  signature: string
): string {
  return new Interface(cmAbi as string[]).encodeFunctionData('executeMetaTransaction', [buyer, functionData, signature])
}

// Read-only provider for the target chain (nonce read + receipt polling), decoupled from the
// wallet's current network — mirrors how lib/buy.ts and lib/trades.ts read the chain.
function readProvider() {
  return new ethers.providers.JsonRpcProvider(config.rpcUrl)
}

/**
 * The buyer's CURRENT meta-transaction nonce, straight from the CreditsManager.
 *
 * Shared by the signing path and the wait below on purpose: the relayer validates against this exact
 * getter, so anything that reasons about the nonce here has to read it the same way.
 */
async function readNonce(contractAddress: string, buyer: string): Promise<ethers.BigNumber> {
  const reader = new ethers.Contract(
    contractAddress,
    ['function getNonce(address) view returns (uint256)'],
    readProvider()
  ) as ethers.Contract & { getNonce(address: string): Promise<ethers.BigNumber> }
  return reader.getNonce(buyer)
}

/**
 * Resolve once the CreditsManager has CONSUMED `signedNonce`, so the next group can be signed safely.
 * Returns false if it has not happened inside the window — the caller must not sign anything after that.
 *
 * WHY THIS EXISTS. The meta-transaction nonce does not travel in the payload. This module reads it from
 * the contract to build the signature, and the transactions-server reads it AGAIN, on its own RPC, to
 * rebuild the digest and recover the signer — so the two reads have to agree. Signing a second group
 * while the first is still in flight guarantees they do not: the digest the relayer rebuilds is not the
 * one the buyer signed, ecrecover returns an unrelated address, and the relayer answers 400 claiming the
 * signature belongs to somebody else. A basket of five mints plus two resales lost both resales exactly
 * that way — the second group was signed 0.6s after the first was broadcast and 0.55s before it mined,
 * and the buyer was never asked to confirm anything, because on this rail there is no prompt to confirm.
 *
 * Waiting on the NONCE instead of on the first transaction's receipt is deliberate. The relayer resubmits
 * with a higher fee when the network is busy, so the hash it handed back frequently never appears on
 * chain at all (measured — see confirmMetaTxByEffect in lib/tx-confirm), and a receipt wait would then
 * time out on a purchase that actually succeeded. The nonce is hash-agnostic: it advances when ANY of
 * those attempts lands, which is exactly the condition that makes the next signature verifiable.
 */
export async function waitForNonceAdvance(opts: {
  chainId: number
  buyer: string
  signedNonce: ethers.BigNumber
  timeoutMs?: number
  pollMs?: number
}): Promise<boolean> {
  const { chainId, buyer, signedNonce, timeoutMs = 120_000 } = opts
  // Floored so a caller passing 0 cannot turn this into a tight loop hammering the RPC.
  const pollMs = Math.max(opts.pollMs ?? 1_500, 50)
  const cm = getContract(ContractName.CreditsManager, chainId)
  const startedAt = Date.now()

  for (;;) {
    try {
      if ((await readNonce(cm.address, buyer)).gt(signedNonce)) return true
    } catch {
      // A failed read is not an answer — keep waiting rather than reporting either outcome.
    }
    if (Date.now() - startedAt >= timeoutMs) return false
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
}

// POST the wrapped meta-tx to the relayer (transactions-server shape). Returns the broadcast txHash and
// the nonce it was signed against, which is what a caller has to see consumed before signing anything else.
async function relay(
  chainId: number,
  buyer: string,
  functionData: string,
  signer: ethers.Signer,
  onSigned?: () => void
): Promise<{ txHash: string; nonce: ethers.BigNumber }> {
  const cm = getContract(ContractName.CreditsManager, chainId) // Amoy 0x8052…fb3

  // 1) fresh nonce (replay protection) from the contract, via read-only RPC
  const nonce = await readNonce(cm.address, buyer)

  // 2) the useCredits calldata IS the meta-tx functionData
  const functionSignature = functionData

  // 3) buyer signs the EIP-712 MetaTransaction — OFF-CHAIN, no gas, no transaction
  const domain = { name: cm.name, version: cm.version, verifyingContract: cm.address, salt: chainIdSalt(chainId) }
  const message = { nonce: nonce.toString(), from: buyer, functionData: functionSignature }
  let signature: string
  try {
    // ethers v5: _signTypedData maps to eth_signTypedData_v4 under the hood for injected wallets.
    signature = await (signer as ethers.providers.JsonRpcSigner)._signTypedData(
      domain,
      { MetaTransaction: OFFCHAIN_META_TRANSACTION_TYPE },
      message
    )
  } catch (e) {
    const err = e as { code?: unknown; message?: string }
    const msg = err?.message ?? 'signature failed'
    // The buyer DISMISSED the signature prompt — that's a cancellation, not a "gasless unavailable"
    // condition. Throwing GaslessUnavailableError here made every caller silently retry with a DIRECT
    // gas-paying useCredits: a no-gas managed (Magic/thirdweb) wallet then reverts with
    // INSUFFICIENT_FUNDS, and a self-custody wallet gets a surprise second (gas) prompt. Surface it as
    // MetaTransactionError(USER_DENIED) so it propagates as a cancel (matches setAuthorization / cancel).
    if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || /denied|reject|cancel/i.test(msg)) {
      throw new MetaTransactionError(msg, ErrorCode.USER_DENIED)
    }
    /**
     * The wallet could not sign, and it was not a cancellation.
     *
     * Reported because this is the one failure in the flow that leaves NO trace anywhere: it never
     * reaches the relayer, so the transactions-server logs nothing, and the credits-server only ever
     * sees the reservation quietly expire. A buyer hit exactly this ("the signing method wasn't
     * supported", a hardware wallet refusing eth_signTypedData_v4) and there was no way to see how,
     * because the message existed only in her browser.
     *
     * `reason: 'contract-account'` is kept on the thrown error for the caller's fallback decision but is a
     * misnomer here — a hardware wallet is not a contract account. The `step` below records what actually
     * happened so the two are distinguishable in Sentry; separating them in the TYPE is a behaviour change
     * and belongs in its own PR.
     *
     * Reported under `flow`/`step` like every other call here, and not under a name of its own: those are
     * the two fields `tagsFrom` promotes to tags. Anything else lands in `extra`, which Sentry does not
     * index — so the one failure that leaves no trace anywhere would also have been the one nobody could
     * search for.
     */
    captureError(e, { flow: 'gasless_relay', step: 'signing_failed', walletMessage: msg, buyer, target: cm.address })
    throw new GaslessUnavailableError(msg, 'contract-account')
  }
  // Wallets disagree on the recovery id. Most return v as 27/28; some — several hardware-wallet and
  // WalletConnect paths — return 0/1. The CreditsManager recovers with OpenZeppelin's ECDSA, which
  // rejects anything outside {27,28} with ECDSAInvalidSignature(), so an unnormalized 0/1 fails gas
  // estimation at the relayer and the purchase dies AFTER the buyer has already signed. It looks like
  // a random failure because it depends entirely on which wallet the buyer uses.
  //
  // splitSignature accepts either form and normalizes the recovery id; joinSignature repacks the
  // canonical 65 bytes. Cheap, and a no-op for a wallet that was already returning 27/28.
  signature = ethers.utils.joinSignature(ethers.utils.splitSignature(signature))

  // Signature obtained (the wallet prompt is dismissed) — the purchase now settles on-chain. Callers
  // use this to flip the UI from "confirm in your wallet" to "completing transaction".
  onSigned?.()

  // 4) pack executeMetaTransaction(buyer, functionData, signature) and POST to the relayer
  const txData = encodeExecuteMetaTransaction(cm.abi, buyer, functionSignature, signature)
  type RelayerResponse = { ok?: boolean; txHash?: string; message?: string; code?: unknown }
  let body: RelayerResponse
  try {
    const res = await fetch(`${gaslessConfig.relayerUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionData: { from: buyer, params: [cm.address, txData] } })
    })
    body = (await res.json()) as RelayerResponse
    if (!res.ok && body?.ok !== true && !body?.txHash) {
      // A parsed body with no hash: an answer, and the answer is no.
      reportRelayerFailure('relayer-rejected', body?.message ?? `relayer ${res.status}`, buyer, cm.address, res.status)
      throw new GaslessUnavailableError(body?.message ?? `relayer ${res.status}`, 'relayer-rejected')
    }
  } catch (e) {
    if (e instanceof GaslessUnavailableError) throw e
    // No usable response — the request may have been submitted before this failed. Not the same as a refusal.
    const msg = (e as Error)?.message ?? 'relayer unreachable'
    reportRelayerFailure('relayer-unreachable', msg, buyer, cm.address)
    throw new GaslessUnavailableError(msg, 'relayer-unreachable')
  }
  if (body?.ok === false || !body?.txHash) {
    reportRelayerFailure('relayer-rejected', body?.message ?? 'relayer rejected the transaction', buyer, cm.address)
    throw new GaslessUnavailableError(body?.message ?? 'relayer rejected the transaction', 'relayer-rejected')
  }
  return { txHash: body.txHash, nonce }
}

// Wait for the relayed tx to land (status===1) via the read-only RPC. Gives the UI immediate
// confirmation; the credits-server intent (salt) still flips PENDING→SETTLED asynchronously once
// the squid indexes CreditUsed — the caller invalidates the balance query after this resolves.
//
// Outcomes the caller must distinguish (the relayer has already broadcast by now):
// - confirmed (status 1)  → resolves.
// - reverted  (status 0)  → throws Error: the credits were NOT consumed on-chain, so releasing the
//   reserved USD is safe and correct.
// - timeout / no receipt  → throws SettlementPendingError: the tx may still mine, so the caller must
//   KEEP the reservation and let the reconciler settle it — releasing risks a double-spend.
export async function waitForSettlement(txHash: string, opts?: { timeoutMs?: number }): Promise<void> {
  const provider = readProvider()
  let receipt: ethers.providers.TransactionReceipt | null
  try {
    receipt = await provider.waitForTransaction(txHash, 1, opts?.timeoutMs ?? 120_000)
  } catch (err) {
    // waitForTransaction rejects on its timeout (and can throw on a transient RPC hiccup): still in
    // flight, not a failure. Preserve the original error as `cause` for observability.
    throw new SettlementPendingError(txHash, { cause: err })
  }
  // No receipt within the window → same as a timeout: possibly still pending.
  if (!receipt) throw new SettlementPendingError(txHash)
  // Mined but reverted → definitive failure; safe to release the reservation.
  if (receipt.status === 0) throw new Error('Purchase reverted')
}

/**
 * Gasless submit of an ALREADY-BUILT CreditsManager.useCredits(args) call. Wraps the exact same
 * meta-tx path buyGasless uses (nonce → off-chain EIP-712 signature → relayer), but takes the
 * pre-encoded `args` tuple instead of building accept([trade]) — so a name-registration external
 * call (server-signed CreditExecutor.execute) can be relayed identically. Returns the broadcast
 * txHash. Throws GaslessUnavailableError when the flag is off / signer is a contract account /
 * relayer is down — the caller should fall back to buy.ts's sendUseCredits.
 */
export async function sendUseCreditsGasless(opts: {
  chainId: number
  buyer: string
  signer: ethers.Signer
  args: unknown
}): Promise<string> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { chainId, buyer, signer, args } = opts
  const cm = getContract(ContractName.CreditsManager, chainId)
  const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
  return (await relay(chainId, buyer, functionData, signer)).txHash
}

/**
 * Gasless single-item buy: buyer signs an off-chain meta-tx wrapping useCredits(accept([trade]));
 * relayer submits + pays gas. Same signature shape as lib/buy.ts's buyWithCredits so call sites
 * can swap based on the feature flag. Returns the broadcast txHash.
 *
 * Throws GaslessUnavailableError when the flag is off / signer is a contract account / relayer is
 * down — the caller should fall back to buyWithCredits.
 */
export async function buyGasless(opts: {
  trade: Trade
  buyer: string
  signer: ethers.Signer
  credits: SpendableCredit[]
  maxCreditedValue: string
}): Promise<string> {
  const { trade, buyer, signer, credits, maxCreditedValue } = opts
  return buyOneGasless({ purchase: { kind: 'trade', trade, credits, maxCreditedValue }, buyer, signer })
}

/**
 * Gasless single-purchase buy for EITHER rail — an offchain trade or a CollectionStore mint. The relayed
 * counterpart to lib/buy's `buyOneWithCredits`, and the reason a mint can be bought from the item page
 * without the buyer holding POL: `buildGroupUseCreditsArgs` builds both kinds of call, so the item page's
 * Buy now reaches the relayer for a mint exactly as a cart containing one does.
 */
export async function buyOneGasless(opts: {
  purchase: AnyPurchase
  buyer: string
  signer: ethers.Signer
}): Promise<string> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { purchase, buyer, signer } = opts
  if (purchase.credits.length === 0) throw new Error('No credits to spend')

  const { args, chainId } = buildGroupUseCreditsArgs(groupPurchases([purchase])[0], buyer)
  const cm = getContract(ContractName.CreditsManager, chainId)
  const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
  return (await relay(chainId, buyer, functionData, signer)).txHash
}

/**
 * Gasless batch buy: mirrors lib/buy.ts's buyManyWithCredits, group for group, and covers BOTH rails —
 * offchain trades (`accept([...])`) and CollectionStore mints (`buy([...])`). One off-chain signature per
 * group; the relayer submits and pays. Returns the txHash(es), in group order.
 *
 * The mint used to be excluded here, which meant every basket containing one fell through to the buyer's own
 * gas-paying transaction. That is the wrong default for this shop: a web2 buyer holds no POL and has never
 * heard of Polygon, so "pay the network fee yourself" is not a route they have. And the exclusion was never
 * about the contracts — `useCredits` takes exactly one external call whichever rail it is, and the store call
 * names the buyer explicitly as the beneficiary (see buildStoreBuyCalldata), so relaying it changes only who
 * transmits and who pays. `buildGroupUseCreditsArgs` builds the calldata for both rails in one place, so the
 * direct and relayed paths cannot disagree about what moves the money.
 */
export async function buyManyGasless(opts: {
  purchases: MixedPurchases
  buyer: string
  signer: ethers.Signer
  /** Fired once the buyer has signed the meta-tx (wallet prompt dismissed), before on-chain settlement. */
  onSigned?: () => void
  /**
   * Fired as each group's meta-transaction is RELAYED, with the credits it spends.
   *
   * The relayer has broadcast by the time `relay()` resolves, so those reservations must not be released on a
   * later failure. This rail needed the signal for a second reason too: settlement is awaited per HASH by the
   * caller, so pairing hash -> salts here is what lets a caller tell WHICH group reverted and which is still
   * pending, instead of having to treat a mixed outcome as all-or-nothing.
   */
  onBroadcast?: (info: { txHash: string; salts: string[] }) => void
  /**
   * Fired while a relayed group is being waited on, before the next group is signed.
   *
   * A mixed basket now spends real time between groups (one block, typically), and this rail asks for no
   * confirmation — so without a signal the UI would sit on the same frame with nothing to say for it.
   */
  onGroupSettling?: (progress: { settled: number; total: number }) => void
}): Promise<string[]> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { purchases, buyer, signer, onSigned, onBroadcast, onGroupSettling } = opts
  if (purchases.length === 0) throw new Error('No items to buy')

  const hashes: string[] = []
  const groups = groupPurchases(purchases)
  for (const [index, group] of groups.entries()) {
    const { args, salts, chainId } = buildGroupUseCreditsArgs(group, buyer)
    const cm = getContract(ContractName.CreditsManager, chainId)
    const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
    const { txHash, nonce } = await relay(chainId, buyer, functionData, signer, onSigned)
    onBroadcast?.({ txHash, salts })
    // See the same call in buy.ts: reported once here, next to the broadcast, so no checkout path can omit
    // it. This rail needs it most — the relayed mint is where the expired-credit reverts came from.
    reportSubmittedTx({ txHash, salts })
    hashes.push(txHash)

    // A mixed basket signs once per group, and each signature is only verifiable while the contract still
    // holds the nonce it was built on — so the next one cannot be produced until this group has consumed
    // it. See waitForNonceAdvance for what happens when it is signed too early. Nothing follows the last
    // group, so there is nothing to wait for.
    if (index === groups.length - 1) continue
    onGroupSettling?.({ settled: index + 1, total: groups.length })
    if (!(await waitForNonceAdvance({ chainId, buyer, signedNonce: nonce }))) {
      /**
       * The relayer took our transaction and it has not landed inside the window. Signing the next group
       * now is the one thing we know produces an invalid signature, so this stops instead.
       *
       * SettlementPendingError and not GaslessUnavailableError, deliberately: this group IS broadcast, so
       * the reserved credits must stay reserved (the credits-server reconciles them against the indexed
       * CreditUsed event), and the caller must not retry the basket on the gas-paying rail — that would
       * buy this group a second time.
       */
      captureError(new Error('nonce did not advance between cart groups'), {
        flow: 'gasless_relay',
        step: 'awaiting_nonce',
        buyer,
        target: cm.address,
        txHash,
        signedNonce: nonce.toString(),
        groupsRelayed: `${index + 1}/${groups.length}`
      })
      throw new SettlementPendingError(txHash)
    }
  }
  return hashes
}
