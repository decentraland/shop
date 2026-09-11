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

/**
 * A creator's discount as the catalog hands it over: everything the marketplace hashes, plus the Merkle
 * proof for THIS listing's collection. The server builds the proof, so the buy side never rebuilds the tree.
 */
export type ListingCoupon = {
  id: string
  signer: string
  couponManager: string
  couponAddress: string
  checks: Trade['checks']
  discountType: number
  /** Parts per million: 300_000 is 30% off. */
  discount: number
  root: string
  collections: string[]
  signature: string
  proof: string[]
}

// A single trade paired with the credit(s) that pay for it and the MANA cap the server sized.
export type CreditPurchase = {
  trade: Trade
  /**
   * The creator discount this trade settles with, when it has one. Its presence changes which marketplace
   * function is called, so it also decides which transaction the line groups into (see purchaseGroupKey):
   * `acceptWithCoupon` needs one coupon per trade, so a batch is either all discounted or none.
   */
  coupon?: ListingCoupon
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

// On-chain Coupon tuple[] — struct Coupon { bytes signature; Checks checks; address couponAddress;
// bytes data; bytes callerData }, in that order.
const COUPON_TUPLE_ARRAY =
  'tuple(bytes signature,' +
  'tuple(uint256 uses,uint256 expiration,uint256 effective,bytes32 salt,uint256 contractSignatureIndex,' +
  'uint256 signerSignatureIndex,bytes32 allowedRoot,bytes32[] allowedProof,' +
  'tuple(address contractAddress,bytes4 selector,bytes value,bool required)[] externalChecks) checks,' +
  'address couponAddress,bytes data,bytes callerData)[]'

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
    // Salts are stored un-padded and timestamps in ms; see getOnChainChecks for why each is normalised.
    checks: getOnChainChecks(trade.checks),
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

/**
 * The checks normalisation `getOnChainTrade` applies, shared so a coupon and the trade it discounts can
 * never disagree about the same fields: seconds rather than milliseconds, a 32-byte salt, a real zero root,
 * and an empty allowedProof.
 *
 * `allowedRoot` is signed; `allowedProof` is caller data and is not. Hardcoding an empty proof is right for
 * a trade, where the marketplace never reads it, but it means a coupon restricted to an allow-list could
 * never be redeemed from here — `_verifyAllowed(root, [], caller)` refuses every buyer. The server rejects
 * such a coupon at creation, so this is a floor rather than a limitation, but the two structs are not
 * interchangeable on this field.
 */
function getOnChainChecks(checks: Trade['checks']) {
  return {
    uses: checks.uses,
    expiration: toChainSeconds(checks.expiration),
    effective: toChainSeconds(checks.effective),
    salt: hexZeroPad(checks.salt, 32),
    contractSignatureIndex: checks.contractSignatureIndex,
    signerSignatureIndex: checks.signerSignatureIndex,
    allowedRoot: checks.allowedRoot && checks.allowedRoot !== '0x' ? checks.allowedRoot : ZERO32,
    allowedProof: [],
    externalChecks: (checks.externalChecks ?? []).map(c => ({
      contractAddress: c.contractAddress,
      selector: c.selector,
      value: c.value,
      required: c.required
    }))
  }
}

/**
 * The coupon as the marketplace takes it.
 *
 * `data` is `CollectionDiscountCouponData` — three static words, so the flat tuple is byte-identical to the
 * struct the contract decodes.
 *
 * `callerData` is NOT: `CollectionDiscountCouponCallerData` wraps `bytes32[][] proofs` in a struct, and
 * because that struct is dynamic its encoding carries one extra offset word ahead of the array. Encoding the
 * bare `bytes32[][]` instead produces something one word short that the contract misreads, so the tuple form
 * here is load-bearing (verified against `cast abi-encode` and the mainnet fork test).
 *
 * `applyCoupon` walks the trade's sent assets and indexes `proofs[i]`, so the array is sized from the trade
 * rather than assumed to hold one entry: a bundle listing sending two items would otherwise read past the
 * end inside the coupon contract. Every asset of one listing belongs to the same collection, so they share
 * the one proof the catalogue built.
 */
export function getOnChainCoupon(coupon: ListingCoupon, sentAssetCount = 1) {
  return {
    signature: coupon.signature,
    checks: getOnChainChecks(coupon.checks),
    couponAddress: coupon.couponAddress,
    data: defaultAbiCoder.encode(
      ['uint256', 'uint256', 'bytes32'],
      [coupon.discountType, coupon.discount, coupon.root]
    ),
    callerData: defaultAbiCoder.encode(
      ['tuple(bytes32[][] proofs)'],
      [{ proofs: Array.from({ length: Math.max(1, sentAssetCount) }, () => coupon.proof) }]
    )
  }
}

/**
 * Encode marketplace.acceptWithCoupon([...trades], [...coupons]).
 *
 * The contract pairs a trade with the coupon at the SAME index, so the two arrays must line up one for one.
 * A mismatch is caught here rather than on chain, where it reverts after the buyer has confirmed and paid
 * gas. It cannot hand one creator's discount to another's listing — `CouponManager.applyCoupon` verifies the
 * coupon signature against the trade's own signer — but two coupons of the SAME creator can still be swapped,
 * which changes what each line costs.
 */
export function buildAcceptWithCouponCalldata(
  trades: Trade[],
  coupons: ListingCoupon[],
  buyer: string,
  marketplaceAbi: unknown[]
) {
  if (trades.length !== coupons.length) {
    throw new Error(`acceptWithCoupon needs one coupon per trade, got ${coupons.length} for ${trades.length} trades`)
  }
  const selector = new Interface(marketplaceAbi as string[]).getSighash('acceptWithCoupon')
  const data = defaultAbiCoder.encode(
    [TRADE_TUPLE_ARRAY, COUPON_TUPLE_ARRAY],
    [trades.map(t => getOnChainTrade(t, buyer)), coupons.map((c, i) => getOnChainCoupon(c, trades[i].sent.length))]
  )
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
  maxCreditedValue: string,
  /**
   * The creator discounts for these trades, one per trade, when the batch is a discounted one. Given, the
   * call becomes `acceptWithCoupon`; the envelope around it is identical either way, which is why both go
   * through here rather than through a parallel builder free to drift on the part that moves money.
   */
  coupons?: ListingCoupon[]
) {
  const { selector, data } = coupons?.length
    ? buildAcceptWithCouponCalldata(trades, coupons, buyer, marketplaceAbi)
    : buildAcceptCalldata(trades, buyer, marketplaceAbi)
  return wrapInUseCredits({ target: marketplaceAddress, selector, data, credits, maxCreditedValue })
}

/**
 * CollectionStore.buy's `ItemToBuy[]` argument.
 *
 * `beneficiaries` is the buyer for every item. Whoever sends the transaction — the CreditsManager on the
 * credits rail, the relayer on a MANA meta-transaction — is the msg.sender, so without naming the buyer the
 * freshly minted NFTs would land there instead of in their hands.
 */
export function itemsToBuyArg(items: StoreItemToBuy[], buyer: string) {
  return items.map(i => ({
    collection: i.collection,
    ids: [i.itemId],
    prices: [i.priceWei],
    beneficiaries: [buyer]
  }))
}

/** Encode CollectionStore.buy([...items]) as a useCredits external call — one call mints the whole batch. */
export function buildStoreBuyCalldata(items: StoreItemToBuy[], buyer: string, collectionStoreAbi: unknown[]) {
  const selector = new Interface(collectionStoreAbi as string[]).getSighash('buy')
  const data = defaultAbiCoder.encode([ITEM_TO_BUY_TUPLE_ARRAY], [itemsToBuyArg(items, buyer)])
  return { selector, data }
}

/**
 * The same `buy([...items])` call as complete calldata, for the rails that call the store DIRECTLY rather
 * than through `useCredits` — paying in MANA, whether relayed as a meta-transaction or submitted by the buyer.
 * Shares `itemsToBuyArg` with the credits rail so the two cannot disagree about what is being minted.
 */
export function encodeStoreBuy(items: StoreItemToBuy[], buyer: string, collectionStoreAbi: unknown[]): string {
  return new Interface(collectionStoreAbi as string[]).encodeFunctionData('buy', [itemsToBuyArg(items, buyer)])
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
