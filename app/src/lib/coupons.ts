import { ethers } from 'ethers'
import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { ChainId, Network, type TradeChecks } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { config } from '~/config'
import { readProvider } from '~/lib/authorizations'
import { requireChain } from '~/lib/network'
import { amoyGasOverrides } from '~/lib/trade-encoding'
import { OFFCHAIN_MARKETPLACE_TYPES } from '~/lib/trades'

// A creator sale is a signed discount coupon over the creator's collections: the marketplace applies it to
// their listings at checkout, so the base listing stays as it is and the price reverts by itself when the
// window closes. The server stores and validates it (marketplace-server /v1/coupons); this module builds,
// signs, posts, lists and ends one.

/** Percentage discount, in parts per million on-chain: 30% is 300_000. The only type the Shop signs. */
export const DISCOUNT_TYPE_RATE = 1
export const MIN_SALE_PCT = 5
export const MAX_SALE_PCT = 70
export const MAX_SALE_DURATION_MS = 30 * 24 * 60 * 60 * 1000
/**
 * The `uses` a sale is signed with when the creator sets no unit limit. The contract needs a number and a
 * million discounted purchases is not a cap anyone reaches; `isSaleCapped` reads anything below it as a limit.
 */
export const UNCAPPED_USES = 1_000_000

export type CreatorSaleStatus = 'scheduled' | 'active' | 'ended' | 'cancelled' | 'exhausted' | 'revoked'

/** A sale as marketplace-server reports it (`GET /v1/coupons`). `checks` timestamps are milliseconds. */
export type CreatorSale = {
  id: string
  signer: string
  chainId: number
  network: string
  checks: TradeChecks
  couponManager: string
  couponAddress: string
  discountType: number
  discount: number
  root: string
  collections: string[]
  signature: string
  createdAt: number
  state: { uses: number; cancelled: boolean; revoked: boolean; checkedAt: number } | null
  status: CreatorSaleStatus
}

/** What `POST /v1/coupons` takes: the signed fields plus the collection list the root was built from. */
export type CouponCreation = {
  signer: string
  chainId: ChainId
  network: Network
  checks: TradeChecks
  couponAddress: string
  discountType: number
  discount: number
  collections: string[]
  signature: string
}

export type CouponContracts = {
  couponManager: { address: string; name: string; version: string; abi: ethers.ContractInterface }
  collectionDiscountCoupon: string
}

// Polygon mainnet is wired on-chain and listed in the public contracts registry, but the transactions library
// version this app pins predates its entry. Remove this map, and the catch branch that reads it, once
// `decentraland-transactions` is bumped to a release that includes `CouponManager` and `CollectionDiscountCoupon`
// for `ChainId.MATIC_MAINNET` (added in decentraland/decentraland-transactions#136): from then on `getContract`
// answers for mainnet and the fallback is dead code.
const MAINNET_FALLBACK = {
  couponManager: '0x3fd3056ee72a2a85e9392fab3a450e7736536081',
  collectionDiscountCoupon: '0xc914507fe297b2dddd1232ac3a8903f1c125e794'
}

/** The coupon deployments for a chain, or null where collections (and so coupons) do not exist. */
export function getCouponContracts(chainId: ChainId): CouponContracts | null {
  try {
    const manager = getContract(ContractName.CouponManager, chainId)
    const coupon = getContract(ContractName.CollectionDiscountCoupon, chainId)
    return {
      couponManager: { address: manager.address, name: manager.name, version: manager.version, abi: manager.abi },
      collectionDiscountCoupon: coupon.address
    }
  } catch {
    if (chainId !== ChainId.MATIC_MAINNET) return null
    // The ABI is the same bytecode on every chain; the Amoy entry is the one the library ships.
    const { abi } = getContract(ContractName.CouponManager, ChainId.MATIC_AMOY)
    return {
      couponManager: { address: MAINNET_FALLBACK.couponManager, name: 'CouponManager', version: '1.0.0', abi },
      collectionDiscountCoupon: MAINNET_FALLBACK.collectionDiscountCoupon
    }
  }
}

/** Lower-cased, de-duplicated, so the same set of collections always hashes to the same root. */
export function normalizeCollections(collections: string[]): string[] {
  return [...new Set(collections.map(c => c.toLowerCase()))]
}

/**
 * The Merkle root the coupon is signed over. Built with OpenZeppelin's StandardMerkleTree, the same library
 * marketplace-server rebuilds it with: the contract only verifies proofs, so any self-consistent tree settles,
 * but the root is a handshake between the signer and the server and both sides have to lay the tree out the
 * same way.
 */
export function collectionsRoot(collections: string[]): string {
  const unique = normalizeCollections(collections)
  if (unique.length === 0) throw new SaleInputError('collections')
  return StandardMerkleTree.of(
    unique.map(c => [c]),
    ['address']
  ).root
}

/** `abi.encode(CollectionDiscountCouponData)`: what the creator signs and the contract decodes. */
export function encodeCouponData(discountPpm: number, root: string): string {
  return ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256', 'bytes32'], [DISCOUNT_TYPE_RATE, discountPpm, root])
}

// Same Checks and ExternalCheck the marketplace signs, so one type set serves both a listing and a coupon.
// A function rather than a constant: it reads the trades module at call time, so a spec that mocks that module
// for its own reasons does not blow up merely by importing this one.
export function couponTypes() {
  return {
    Coupon: [
      { name: 'checks', type: 'Checks' },
      { name: 'couponAddress', type: 'address' },
      { name: 'data', type: 'bytes' }
    ],
    Checks: OFFCHAIN_MARKETPLACE_TYPES.Checks,
    ExternalCheck: OFFCHAIN_MARKETPLACE_TYPES.ExternalCheck
  }
}

const toSeconds = (ms: number) => Math.floor(ms / 1000)

export function couponDomain(chainId: ChainId, contracts: CouponContracts) {
  return {
    name: contracts.couponManager.name,
    version: contracts.couponManager.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
    verifyingContract: contracts.couponManager.address
  }
}

/** The EIP-712 values for a coupon: `checks` in seconds, the way the contract reads them. */
export function couponTypedValues(checks: TradeChecks, couponAddress: string, data: string) {
  return {
    checks: {
      uses: checks.uses,
      expiration: toSeconds(checks.expiration),
      effective: toSeconds(checks.effective),
      salt: ethers.utils.hexZeroPad(checks.salt, 32),
      contractSignatureIndex: checks.contractSignatureIndex,
      signerSignatureIndex: checks.signerSignatureIndex,
      allowedRoot: ethers.utils.hexZeroPad(checks.allowedRoot || '0x', 32),
      externalChecks: []
    },
    couponAddress,
    data
  }
}

export type SaleInputProblem = 'collections' | 'pct' | 'window' | 'duration' | 'uses'

/** A sale the creator asked for that the contract, the server or the product would refuse. The UI maps the code to copy. */
export class SaleInputError extends Error {
  constructor(public problem: SaleInputProblem) {
    super(`Invalid sale: ${problem}`)
    this.name = 'SaleInputError'
  }
}

export type SaleTerms = {
  collections: string[]
  /** Whole percent, 5 to 70. */
  discountPct: number
  /** Epoch ms. Omitted = starts now. */
  startsAtMs?: number
  /** Epoch ms. */
  endsAtMs: number
  /** How many discounted purchases the sale allows. Omitted = no limit. */
  uses?: number
}

/** Rejects terms the contract, the server or the product would refuse, before anything is signed. */
export function validateSaleTerms(terms: SaleTerms, now = Date.now()): void {
  if (normalizeCollections(terms.collections).length === 0) throw new SaleInputError('collections')
  if (!Number.isInteger(terms.discountPct) || terms.discountPct < MIN_SALE_PCT || terms.discountPct > MAX_SALE_PCT) {
    throw new SaleInputError('pct')
  }
  const startsAt = terms.startsAtMs ?? now
  if (!(terms.endsAtMs > now) || !(terms.endsAtMs > startsAt)) throw new SaleInputError('window')
  if (terms.endsAtMs - Math.max(startsAt, now) > MAX_SALE_DURATION_MS) throw new SaleInputError('duration')
  if (terms.uses !== undefined && (!Number.isInteger(terms.uses) || terms.uses < 1)) throw new SaleInputError('uses')
}

const INDEX_ABI = [
  'function contractSignatureIndex() view returns (uint256)',
  'function signerSignatureIndex(address) view returns (uint256)'
]

type IndexContract = ethers.Contract & {
  contractSignatureIndex(): Promise<ethers.BigNumber>
  signerSignatureIndex(address: string): Promise<ethers.BigNumber>
}

/** The CouponManager's current signature indexes, read from the target chain, never the wallet's network. */
export async function readCouponIndexes(
  couponManager: string,
  signer: string
): Promise<{ contractSignatureIndex: number; signerSignatureIndex: number }> {
  const manager = new ethers.Contract(couponManager, INDEX_ABI, readProvider()) as IndexContract
  const [contractIndex, signerIndex] = await Promise.all([
    manager.contractSignatureIndex(),
    manager.signerSignatureIndex(signer)
  ])
  return { contractSignatureIndex: contractIndex.toNumber(), signerSignatureIndex: signerIndex.toNumber() }
}

/**
 * Build and sign a collection sale: one EIP-712 signature, no transaction. Returns the payload
 * `POST /v1/coupons` takes.
 */
export async function createCollectionSale(
  opts: { signer: ethers.Signer; chainId: ChainId } & SaleTerms,
  deps: { readIndexes?: typeof readCouponIndexes; now?: () => number } = {}
): Promise<CouponCreation> {
  const now = deps.now ? deps.now() : Date.now()
  validateSaleTerms(opts, now)

  const contracts = getCouponContracts(opts.chainId)
  if (!contracts) throw new Error(`Coupons are not available on chain ${opts.chainId}`)

  const creator = (await opts.signer.getAddress()).toLowerCase()
  const collections = normalizeCollections(opts.collections)
  const indexes = await (deps.readIndexes ?? readCouponIndexes)(contracts.couponManager.address, creator)

  const checks: TradeChecks = {
    uses: opts.uses ?? UNCAPPED_USES,
    expiration: opts.endsAtMs,
    effective: opts.startsAtMs ?? now,
    salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
    contractSignatureIndex: indexes.contractSignatureIndex,
    signerSignatureIndex: indexes.signerSignatureIndex,
    allowedRoot: '0x',
    externalChecks: []
  }
  const discount = opts.discountPct * 10_000
  const data = encodeCouponData(discount, collectionsRoot(collections))

  const signature = await (opts.signer as ethers.providers.JsonRpcSigner)._signTypedData(
    couponDomain(opts.chainId, contracts),
    couponTypes(),
    couponTypedValues(checks, contracts.collectionDiscountCoupon, data)
  )

  return {
    signer: creator,
    chainId: opts.chainId,
    network: Network.MATIC,
    checks,
    couponAddress: contracts.collectionDiscountCoupon,
    discountType: DISCOUNT_TYPE_RATE,
    discount,
    collections,
    signature
  }
}

/** Stores the signed sale so the catalogue starts applying it. Signed fetch: the server checks the caller is the signer. */
export async function postCoupon(payload: CouponCreation, identity: AuthIdentity): Promise<CreatorSale> {
  const res = await signedFetch(`${config.marketplaceServerUrl}/v1/coupons`, {
    method: 'POST',
    identity,
    metadata: { signer: 'dcl:marketplace', intent: 'dcl:create-coupon' },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: CreatorSale; message?: string }
  if (!res.ok || !json.ok || !json.data) throw new Error(json.message ?? `postCoupon ${res.status}`)
  return json.data
}

/** A creator's sales, newest first, with their last known state. Public: coupons are public signatures. */
export async function fetchCreatorSales(address: string): Promise<CreatorSale[]> {
  const res = await fetch(`${config.marketplaceServerUrl}/v1/coupons?signer=${address.toLowerCase()}`)
  if (!res.ok) {
    // Release the connection before throwing: an unread body on the error path leaks it.
    void res.body?.cancel()
    throw new Error(`fetchCreatorSales ${res.status}`)
  }
  const json = (await res.json()) as { ok?: boolean; data?: CreatorSale[] }
  return json.data ?? []
}

/** Whether the creator limited how many purchases the sale allows. */
export function isSaleCapped(sale: Pick<CreatorSale, 'checks'>): boolean {
  return sale.checks.uses < UNCAPPED_USES
}

/** The server's status, refreshed against the clock: a sale the server called active may have ended since it answered. */
export function liveSaleStatus(sale: Pick<CreatorSale, 'status' | 'checks'>, now = Date.now()): CreatorSaleStatus {
  if (sale.status === 'cancelled' || sale.status === 'revoked' || sale.status === 'exhausted') return sale.status
  if (sale.checks.expiration <= now) return 'ended'
  if (sale.checks.effective > now) return 'scheduled'
  return 'active'
}

type CouponManagerContract = ethers.Contract & {
  cancelSignature(coupons: unknown[], overrides?: ethers.Overrides): Promise<ethers.ContractTransaction>
}

/**
 * End a sale early: `CouponManager.cancelSignature` from the creator's wallet. The wallet broadcasts it, so
 * it has to be on the sale's chain already; like ending a listing, this only checks and never switches.
 * The catalogue stops applying the coupon as soon as the server's next state read sees the cancellation.
 */
export async function endSale(opts: { sale: CreatorSale; signer: ethers.Signer }): Promise<string> {
  const { sale, signer } = opts
  await requireChain(signer.provider as ethers.providers.Web3Provider, sale.chainId)
  const contracts = getCouponContracts(sale.chainId)
  if (!contracts) throw new Error(`Coupons are not available on chain ${sale.chainId}`)

  // The manager address comes from this build's contract registry, never from the API row: the wallet is about to
  // send a transaction to it, and the server's copy is only there to describe the sale.
  const manager = new ethers.Contract(
    contracts.couponManager.address,
    contracts.couponManager.abi,
    signer
  ) as CouponManagerContract
  const onChainCoupon = {
    signature: sale.signature,
    checks: {
      uses: sale.checks.uses,
      expiration: toSeconds(sale.checks.expiration),
      effective: toSeconds(sale.checks.effective),
      salt: ethers.utils.hexZeroPad(sale.checks.salt, 32),
      contractSignatureIndex: sale.checks.contractSignatureIndex,
      signerSignatureIndex: sale.checks.signerSignatureIndex,
      allowedRoot: ethers.utils.hexZeroPad(sale.checks.allowedRoot || '0x', 32),
      allowedProof: [],
      externalChecks: []
    },
    couponAddress: sale.couponAddress,
    data: encodeCouponData(sale.discount, sale.root),
    callerData: '0x'
  }
  const tx = await manager.cancelSignature([onChainCoupon], amoyGasOverrides(sale.chainId))
  const receipt = await tx.wait()
  return receipt.transactionHash
}
