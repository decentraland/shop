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

/**
 * A CollectionStore mint: the primary-sale path for items that were never listed as a trade.
 *
 * `priceWei` is read as LATE as possible on purpose. CollectionStore.buy takes the prices as an argument and
 * the contract re-validates them against the item's live on-chain price, reverting if it moved. A trade cannot
 * fail this way — its price is signed into the order — so this is the one purchase path where a stale quote is
 * a revert rather than a wrong number.
 */
export type StoreItemToBuy = {
  /** The collection contract that holds the item. */
  collection: string
  /** The item's blockchain id within the collection. */
  itemId: string
  /** MANA wei, as the contract will verify it. */
  priceWei: string
}

// A store mint paired with the credit(s) that pay for it and the MANA cap the server sized.
export type StorePurchase = {
  item: StoreItemToBuy
  credits: SpendableCredit[]
  maxCreditedValue: string
  chainId: number
}

// CollectionStore.buy's argument: struct ItemToBuy[] — one call mints many items across many collections,
// which is what lets a whole cart of store items settle in a single transaction.
const ITEM_TO_BUY_TUPLE_ARRAY = 'tuple(address collection,uint256[] ids,uint256[] prices,address[] beneficiaries)[]'

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
  return wrapInUseCredits({ target: marketplaceAddress, selector, data, credits, maxCreditedValue })
}

/**
 * CollectionStore.buy's `ItemToBuy[]` argument.
 *
 * `beneficiaries` is the buyer for every item, and it is the reason this cannot be defaulted: whoever
 * sends the transaction receives the mint unless told otherwise. On the credits rail the sender is the
 * CreditsManager, so without this the NFTs would land there instead of with the buyer. On the MANA rail
 * the sender IS the buyer, but naming them explicitly keeps one shape for both.
 *
 * Shared by both rails so the argument they mint with cannot drift — the same reason `wrapInUseCredits`
 * is shared below.
 */
export function buildStoreItemsToBuy(items: StoreItemToBuy[], buyer: string) {
  return items.map(i => ({
    collection: i.collection,
    ids: [i.itemId],
    prices: [i.priceWei],
    beneficiaries: [buyer]
  }))
}

/** Encode CollectionStore.buy([...items]) — one external call mints every item in the batch. */
export function buildStoreBuyCalldata(items: StoreItemToBuy[], buyer: string, collectionStoreAbi: unknown[]) {
  const selector = new Interface(collectionStoreAbi as string[]).getSighash('buy')
  const data = defaultAbiCoder.encode([ITEM_TO_BUY_TUPLE_ARRAY], [buildStoreItemsToBuy(items, buyer)])
  return { selector, data }
}

// Build the CreditsManager.useCredits() args for a batch of CollectionStore mints.
export function buildStoreUseCreditsArgs(
  collectionStoreAddress: string,
  collectionStoreAbi: unknown[],
  items: StoreItemToBuy[],
  buyer: string,
  credits: SpendableCredit[],
  maxCreditedValue: string
) {
  const { selector, data } = buildStoreBuyCalldata(items, buyer, collectionStoreAbi)
  return wrapInUseCredits({ target: collectionStoreAddress, selector, data, credits, maxCreditedValue })
}

/**
 * The shared useCredits envelope: the credits, their signatures, the single external call, and the value caps.
 *
 * Extracted so the trade and store paths cannot drift on the part that moves money. In particular
 * `maxUncreditedValue` — the MANA the buyer pays from their OWN wallet to cover whatever the credits do not —
 * is derived here from `maxCreditedValue`, which callers must set to the amount the SERVER sized at
 * /credits/authorize. Deriving it from an item or trade price instead leaves a positive gap and silently
 * charges the buyer the difference in MANA.
 */
function wrapInUseCredits(opts: {
  target: string
  selector: string
  data: string
  credits: SpendableCredit[]
  maxCreditedValue: string
}) {
  const { target, selector, data, credits, maxCreditedValue } = opts
  const sumAvailable = credits.reduce(
    (acc, c) => acc.add(ethers.BigNumber.from(c.availableAmount)),
    ethers.BigNumber.from(0)
  )
  const uncredited = ethers.BigNumber.from(maxCreditedValue).sub(sumAvailable)
  return {
    credits: credits.map(c => ({ value: c.amount, expiresAt: Number(c.expiresAt), salt: idToSalt(c.id) })),
    creditsSignatures: credits.map(c => c.signature),
    externalCall: {
      target,
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
