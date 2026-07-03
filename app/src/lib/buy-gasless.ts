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
import { valueForAsset } from '~/lib/trades'
import type { SpendableCredit, CreditPurchase } from '~/lib/buy'

const { defaultAbiCoder, Interface, hexZeroPad, hexlify, randomBytes } = ethers.utils

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

// ---------------------------------------------------------------------------
// useCredits args — same shape/logic as lib/buy.ts (kept local so the gasless path is
// self-contained and can evolve independently; the ON-CHAIN bytes are identical).
// ---------------------------------------------------------------------------

const TRADE_TUPLE_ARRAY =
  'tuple(address signer,bytes signature,' +
  'tuple(uint256 uses,uint256 expiration,uint256 effective,bytes32 salt,uint256 contractSignatureIndex,' +
  'uint256 signerSignatureIndex,bytes32 allowedRoot,bytes32[] allowedProof,' +
  'tuple(address contractAddress,bytes4 selector,bytes value,bool required)[] externalChecks) checks,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] sent,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] received)[]'

const ZERO32 = '0x' + '0'.repeat(64)

const toChainSeconds = (v: number | string) => {
  const n = Number(v)
  return n > 1e12 ? Math.floor(n / 1000) : n
}

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

function buildAcceptCalldata(trades: Trade[], buyer: string, marketplaceAbi: unknown[]) {
  const selector = new Interface(marketplaceAbi as string[]).getSighash('accept')
  const data = defaultAbiCoder.encode([TRADE_TUPLE_ARRAY], [trades.map(t => getOnChainTrade(t, buyer))])
  return { selector, data }
}

function idToSalt(id: string): string {
  if (!id) return ZERO32
  return id.startsWith('0x') ? hexZeroPad(id, 32) : hexZeroPad('0x' + Buffer.from(id).toString('hex'), 32)
}

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

// ---------------------------------------------------------------------------
// Meta-transaction: build EIP-712, get the buyer's off-chain signature, relay.
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
async function relay(chainId: number, buyer: string, functionData: string, signer: ethers.Signer): Promise<string> {
  const cm = getContract(ContractName.CreditsManager, chainId) // Amoy 0x8052…fb3

  // 1) fresh nonce (replay protection) from the contract, via read-only RPC
  const reader = new ethers.Contract(cm.address, ['function getNonce(address) view returns (uint256)'], readProvider())
  const nonce: ethers.BigNumber = await reader.getNonce(buyer)

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

  // 4) pack executeMetaTransaction(buyer, functionData, signature) and POST to the relayer
  const txData = encodeExecuteMetaTransaction(cm.abi as unknown[], buyer, functionSignature, signature)
  let body: { ok?: boolean; txHash?: string; message?: string; code?: unknown }
  try {
    const res = await fetch(`${gaslessConfig.relayerUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionData: { from: buyer, params: [cm.address, txData] } })
    })
    body = await res.json()
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
export async function waitForSettlement(txHash: string, opts?: { timeoutMs?: number }): Promise<void> {
  const provider = readProvider()
  const receipt = await provider.waitForTransaction(txHash, 1, opts?.timeoutMs ?? 120_000)
  if (!receipt || receipt.status !== 1) throw new Error('Purchase did not confirm')
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
  const args = buildUseCreditsArgs(marketplace.address, marketplace.abi as unknown[], [trade], buyer, credits, maxCreditedValue)
  const cm = getContract(ContractName.CreditsManager, trade.chainId)
  const functionData = new Interface(cm.abi as unknown as string[]).encodeFunctionData('useCredits', [args])
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
}): Promise<string[]> {
  if (!gaslessConfig.enabled) throw new GaslessUnavailableError('gasless checkout disabled', 'disabled')
  const { purchases, buyer, signer } = opts
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
    const args = buildUseCreditsArgs(marketplace.address, marketplace.abi as unknown[], trades, buyer, credits, maxCreditedValue)
    const cm = getContract(ContractName.CreditsManager, chainId)
    const functionData = new Interface(cm.abi as unknown as string[]).encodeFunctionData('useCredits', [args])
    hashes.push(await relay(chainId, buyer, functionData, signer))
  }
  return hashes
}
