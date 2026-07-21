// Gasless checkout — the buyer signs ONLY an off-chain EIP-712 message; a relayer submits
// CreditsManager.executeMetaTransaction(...) and pays the gas.
//
// NEW file. Does NOT modify lib/buy.ts. Reuses its exported types (SpendableCredit,
// CreditPurchase) and rebuilds the exact same useCredits(UseCreditsArgs) calldata, then wraps
// it in the Decentraland/Polygon native meta-transaction and POSTs it to the relayer.
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
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
import { config } from '~/config'
import { gaslessConfig } from '~/lib/gasless-config'
import { buildUseCreditsArgs, type CreditPurchase, type SpendableCredit } from '~/lib/trade-encoding'

const { Interface, hexZeroPad } = ethers.utils

// Thrown when the gasless path can't run (flag off, contract account, relayer down). The caller
// catches this and falls back to buyWithCredits (buyer submits + pays gas) — see GASLESS_SPEC §6.
export class GaslessUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'disabled' | 'contract-account' | 'relayer' | 'unknown' = 'unknown'
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

// POST the wrapped meta-tx to the relayer (transactions-server shape). Returns the broadcast txHash.
async function relay(
  chainId: number,
  buyer: string,
  functionData: string,
  signer: ethers.Signer,
  onSigned?: () => void
): Promise<string> {
  const cm = getContract(ContractName.CreditsManager, chainId) // Amoy 0x8052…fb3

  // 1) fresh nonce (replay protection) from the contract, via read-only RPC
  const reader = new ethers.Contract(
    cm.address,
    ['function getNonce(address) view returns (uint256)'],
    readProvider()
  ) as ethers.Contract & { getNonce(address: string): Promise<ethers.BigNumber> }
  const nonce = await reader.getNonce(buyer)

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
    const msg = (e as Error)?.message ?? 'signature failed'
    // A contract wallet that can't personal-sign → fall back to normal checkout.
    throw new GaslessUnavailableError(msg, /denied/i.test(msg) ? 'unknown' : 'contract-account')
  }
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
      throw new GaslessUnavailableError(body?.message ?? `relayer ${res.status}`, 'relayer')
    }
  } catch (e) {
    if (e instanceof GaslessUnavailableError) throw e
    throw new GaslessUnavailableError((e as Error)?.message ?? 'relayer unreachable', 'relayer')
  }
  if (body?.ok === false || !body?.txHash) {
    throw new GaslessUnavailableError(body?.message ?? 'relayer rejected the transaction', 'relayer')
  }
  return body.txHash
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
export async function useCreditsGasless(opts: {
  chainId: number
  buyer: string
  signer: ethers.Signer
  args: unknown
}): Promise<string> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { chainId, buyer, signer, args } = opts
  const cm = getContract(ContractName.CreditsManager, chainId)
  const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
  return relay(chainId, buyer, functionData, signer)
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
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { trade, buyer, signer, credits, maxCreditedValue } = opts
  if (credits.length === 0) throw new Error('No credits to spend')

  const marketplace = getContract(getContractName(trade.contract), trade.chainId)
  const args = buildUseCreditsArgs(marketplace.address, marketplace.abi, [trade], buyer, credits, maxCreditedValue)
  const cm = getContract(ContractName.CreditsManager, trade.chainId)
  const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
  return relay(trade.chainId, buyer, functionData, signer)
}

/**
 * Gasless batch buy: mirrors lib/buy.ts's buyManyWithCredits. All trades on the same
 * (chain, marketplace) are fulfilled by ONE useCredits(accept([...])), wrapped in ONE meta-tx →
 * one off-chain signature per group. Returns the txHash(es).
 */
export async function buyManyGasless(opts: {
  purchases: CreditPurchase[]
  buyer: string
  signer: ethers.Signer
  /** Fired once the buyer has signed the meta-tx (wallet prompt dismissed), before on-chain settlement. */
  onSigned?: () => void
}): Promise<string[]> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { purchases, buyer, signer, onSigned } = opts
  if (purchases.length === 0) throw new Error('No items to buy')

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
    const cm = getContract(ContractName.CreditsManager, chainId)
    const functionData = new Interface(cm.abi).encodeFunctionData('useCredits', [args])
    hashes.push(await relay(chainId, buyer, functionData, signer, onSigned))
  }
  return hashes
}
