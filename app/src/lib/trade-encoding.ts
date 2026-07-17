import { ethers } from 'ethers'
import { type Trade } from '@dcl/schemas'
import { valueForAsset } from '~/lib/trades'

// Shared on-chain encoding for CreditsManager.useCredits(accept([...trades])). Used by BOTH the
// normal (buyer-submitted) path (lib/buy.ts) and the gasless (meta-tx) path (lib/buy-gasless.ts) so
// the produced calldata is guaranteed byte-identical — a single source of truth for the bytes.

const { defaultAbiCoder, Interface, hexZeroPad, hexlify, randomBytes } = ethers.utils

// The credit fields the CreditsManager actually spends — satisfied by both a legacy ServerCredit and
// an ephemeral AuthorizedCredit from /credits/authorize.
export type SpendableCredit = {
  id: string
  amount: string
  availableAmount: string
  expiresAt: number
  signature: string
}

// A single trade paired with the credit(s) that pay for it and the MANA cap the server sized.
export type CreditPurchase = {
  trade: Trade
  credits: SpendableCredit[]
  maxCreditedValue: string
}

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
export function getOnChainTrade(trade: Trade, buyer: string) {
  return {
    signer: trade.signer,
    signature: trade.signature,
    checks: {
      uses: trade.checks.uses,
      expiration: toChainSeconds(trade.checks.expiration),
      effective: toChainSeconds(trade.checks.effective),
      // Salts are stored un-padded (variable length) but signed + encoded as bytes32 — pad to 32,
      // exactly like decentraland-dapps' getOnChainTrade. Without this, any non-32-byte salt (e.g.
      // legacy listings) throws "incorrect data length" in the ABI encoder.
      salt: hexZeroPad(trade.checks.salt, 32),
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
export function buildAcceptCalldata(trades: Trade[], buyer: string, marketplaceAbi: unknown[]) {
  const selector = new Interface(marketplaceAbi as string[]).getSighash('accept')
  const data = defaultAbiCoder.encode([TRADE_TUPLE_ARRAY], [trades.map(t => getOnChainTrade(t, buyer))])
  return { selector, data }
}

// Amoy enforces a ~25 gwei minimum priority fee; MetaMask often proposes less → the RPC rejects with
// "gas tip cap below minimum". Floor the tip on Amoy so it goes through without manual editing.
export function amoyGasOverrides(chainId: number): {
  maxPriorityFeePerGas?: ethers.BigNumber
  maxFeePerGas?: ethers.BigNumber
} {
  if (chainId !== 80002) return {}
  const tip = ethers.utils.parseUnits('30', 'gwei')
  return { maxPriorityFeePerGas: tip, maxFeePerGas: tip.add(ethers.utils.parseUnits('50', 'gwei')) }
}

export function idToSalt(id: string): string {
  if (!id) return ZERO32
  return id.startsWith('0x') ? hexZeroPad(id, 32) : hexZeroPad('0x' + Buffer.from(id).toString('hex'), 32)
}

// Build the CreditsManager.useCredits() args for a set of trades on ONE marketplace, spending the
// given credits. maxCreditedValue is the total MANA the batch may draw; uncredited covers any gap the
// credits don't (0 for our ephemeral credits, which are sized exactly to their trades).
export function buildUseCreditsArgs(
  marketplaceAddress: string,
  marketplaceAbi: unknown[],
  trades: Trade[],
  buyer: string,
  credits: SpendableCredit[],
  maxCreditedValue: string
) {
  const { selector, data } = buildAcceptCalldata(trades, buyer, marketplaceAbi)
  const sumAvailable = credits.reduce(
    (acc, c) => acc.add(ethers.BigNumber.from(c.availableAmount)),
    ethers.BigNumber.from(0)
  )
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
