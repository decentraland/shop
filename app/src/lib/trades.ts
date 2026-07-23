import { ethers } from 'ethers'
import { ChainId, Network, TradeAssetType, TradeType, type TradeCreation } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'
import {
  AuthorizationKind,
  ensureAuthorization,
  ensureChain,
  getAuthorizationStatus,
  getCollectionSellingAuthorization,
  readProvider,
  type ShopAuthorization
} from '~/lib/authorizations'

// The on-chain approval plumbing now lives in ~/lib/authorizations (the first-class module). Re-export
// ensureChain so existing importers (e.g. ~/lib/buy) keep working without churn.
export { ensureChain }

const toSeconds = (ms: number) => Math.floor(ms / 1000)

// USD_PEGGED_MANA-aware value extractor. decentraland-dapps' getValueForTradeAsset has no case for
// USD_PEGGED_MANA and returns '' (invalid signature), so we own the signing path here.
export function valueForAsset(asset: {
  assetType: TradeAssetType
  tokenId?: string
  itemId?: string
  amount?: string
}): string {
  switch (asset.assetType) {
    case TradeAssetType.ERC721:
      return asset.tokenId as string
    case TradeAssetType.COLLECTION_ITEM:
      return asset.itemId as string
    case TradeAssetType.ERC20:
    case TradeAssetType.USD_PEGGED_MANA:
      return asset.amount as string
    default:
      throw new Error(`Unsupported assetType ${String(asset.assetType)}`)
  }
}

// Mirrors decentraland-dapps generateTradeValues, with USD-pegged support.
export function generateTradeValues(trade: Omit<TradeCreation, 'signature'>) {
  return {
    checks: {
      uses: trade.checks.uses,
      expiration: toSeconds(trade.checks.expiration),
      effective: toSeconds(trade.checks.effective),
      salt: ethers.utils.hexZeroPad(trade.checks.salt, 32),
      contractSignatureIndex: trade.checks.contractSignatureIndex,
      signerSignatureIndex: trade.checks.signerSignatureIndex,
      allowedRoot: ethers.utils.hexZeroPad(trade.checks.allowedRoot || '0x', 32),
      externalChecks: (trade.checks.externalChecks ?? []).map(c => ({
        contractAddress: c.contractAddress,
        selector: c.selector,
        value: c.value ? c.value : '0x',
        required: c.required
      }))
    },
    sent: trade.sent.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x'
    })),
    received: trade.received.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x',
      beneficiary: a.beneficiary
    }))
  }
}

const OFFCHAIN_MARKETPLACE_TYPES = {
  Trade: [
    { name: 'checks', type: 'Checks' },
    { name: 'sent', type: 'AssetWithoutBeneficiary[]' },
    { name: 'received', type: 'Asset[]' }
  ],
  Asset: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' },
    { name: 'beneficiary', type: 'address' }
  ],
  AssetWithoutBeneficiary: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' }
  ],
  Checks: [
    { name: 'uses', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'effective', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'contractSignatureIndex', type: 'uint256' },
    { name: 'signerSignatureIndex', type: 'uint256' },
    { name: 'allowedRoot', type: 'bytes32' },
    { name: 'externalChecks', type: 'ExternalCheck[]' }
  ],
  ExternalCheck: [
    { name: 'contractAddress', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'value', type: 'bytes' },
    { name: 'required', type: 'bool' }
  ]
}

const INDEX_ABI = [
  'function contractSignatureIndex() view returns (uint256)',
  'function signerSignatureIndex(address) view returns (uint256)'
]

// ethers v5 `Contract` exposes dynamically-named ABI methods through an `any` index signature. Narrow
// each contract to the fragments its ABI declares so reads/txs above stay type-checked.
type IndexContract = ethers.Contract & {
  contractSignatureIndex(): Promise<ethers.BigNumber>
  signerSignatureIndex(address: string): Promise<ethers.BigNumber>
}

// A published collection lets its creator grant "minters". A primary (mint) listing only works if the
// offchain marketplace is a minter of the collection — the trade signature alone doesn't grant mint
// rights (BUILDER_LISTING_SPEC §4.2).
function minterAuthorization(contractAddress: string, chainId: ChainId): ShopAuthorization {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  return {
    kind: AuthorizationKind.Minter,
    contractAddress,
    spenderAddress: market.address,
    chainId
  }
}

// The listing signature doesn't grant transfer rights — the seller must approve the marketplace as
// operator once. Delegates to the authorizations module: reads approval via the target-chain RPC and
// sends setApprovalForAll only if missing (switching the wallet to the asset's chain just-in-time).
export async function ensureApproval(opts: {
  signer: ethers.providers.JsonRpcSigner
  contractAddress: string
  chainId: ChainId
}): Promise<void> {
  const auth = getCollectionSellingAuthorization(opts.contractAddress, opts.chainId)
  await ensureAuthorization({ auth, signer: opts.signer })
}

/**
 * Build + sign a USD-pegged public_nft_order for one ERC721.
 * @param usdPrice human USD value (e.g. 1 for $1)
 * @param expiresAtMs expiration timestamp in milliseconds
 */
export async function createUsdPeggedListing(opts: {
  signer: ethers.providers.JsonRpcSigner
  nft: { contractAddress: string; tokenId: string; network: Network; chainId: ChainId }
  usdPrice: number
  expiresAtMs: number
  fingerprint?: string
}): Promise<TradeCreation> {
  const { signer, nft, usdPrice, expiresAtMs, fingerprint = '' } = opts
  const seller = (await signer.getAddress()).toLowerCase()

  const market = getContract(ContractName.OffChainMarketplaceV2, nft.chainId)
  const mana = getContract(ContractName.MANAToken, nft.chainId)

  // Read signature indices from the target-chain RPC (not the wallet's network).
  const marketC = new ethers.Contract(market.address, INDEX_ABI, readProvider()) as IndexContract
  const contractSignatureIndex = await marketC.contractSignatureIndex()
  const signerSignatureIndex = await marketC.signerSignatureIndex(seller)

  const tradeToSign: Omit<TradeCreation, 'signature'> = {
    signer: seller,
    network: nft.network,
    chainId: nft.chainId,
    type: TradeType.PUBLIC_NFT_ORDER,
    checks: {
      uses: 1,
      expiration: expiresAtMs,
      effective: Date.now(),
      salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      contractSignatureIndex: contractSignatureIndex.toNumber(),
      signerSignatureIndex: signerSignatureIndex.toNumber(),
      allowedRoot: '0x',
      externalChecks: []
    },
    sent: [
      {
        assetType: TradeAssetType.ERC721,
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        extra: fingerprint
      }
    ],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: mana.address,
        amount: ethers.utils.parseEther(String(usdPrice)).toString(),
        extra: '',
        beneficiary: seller
      }
    ]
  }

  const domain = {
    name: market.name,
    version: market.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(nft.chainId), 32),
    verifyingContract: market.address
  }

  const signature = await signer._signTypedData(domain, OFFCHAIN_MARKETPLACE_TYPES, generateTradeValues(tradeToSign))

  return { ...tradeToSign, signature }
}

// ---------------------------------------------------------------------------
// Primary (mint) listing — public_item_order
// ---------------------------------------------------------------------------

/**
 * Read-only: is the offchain marketplace already an allowed minter on this collection?
 * Reads via the target-chain RPC (independent of the wallet's current network). When true, primary
 * listing works with no extra one-time action; when false, the creator must enable it once.
 */
export async function isMarketplaceMinter(opts: { contractAddress: string; chainId: ChainId }): Promise<boolean> {
  // globalMinters ignores the owner argument, so an empty address is fine here.
  return getAuthorizationStatus(minterAuthorization(opts.contractAddress, opts.chainId), '')
}

/**
 * One-time enablement so the Shop can fulfil sales of this collection: grants the offchain
 * marketplace mint rights (setMinters). Only the collection creator can do this. No-op if already
 * enabled. Switches the wallet to the collection's chain just-in-time (the only step needing it).
 */
export async function ensureMinter(opts: {
  signer: ethers.providers.JsonRpcSigner
  contractAddress: string
  chainId: ChainId
}): Promise<void> {
  await ensureAuthorization({ auth: minterAuthorization(opts.contractAddress, opts.chainId), signer: opts.signer })
}

/**
 * Build + sign a USD-pegged public_item_order for one COLLECTION ITEM (primary / mint sale).
 * Mirrors createUsdPeggedListing with the primary deltas (BUILDER_LISTING_SPEC §3):
 *   type:            public_nft_order  → public_item_order
 *   sent:            ERC721(tokenId)   → COLLECTION_ITEM(itemId = blockchain_item_id)
 *   checks.uses:     1                 → remaining supply (or 1)
 * Everything else identical: USD_PEGGED_MANA received, EIP-712 domain/types, SECONDS conversion, POST.
 *
 * @param item.itemId the on-chain item index (blockchain_item_id) — NOT the builder UUID.
 * @param uses how many units this listing may mint (defaults to remaining supply, or 1).
 * @param usdPrice human USD value (e.g. 1 for $1)
 * @param expiresAtMs expiration timestamp in milliseconds
 */
export async function createPrimaryUsdPeggedListing(opts: {
  signer: ethers.providers.JsonRpcSigner
  item: { contractAddress: string; itemId: string; network: Network; chainId: ChainId }
  usdPrice: number
  expiresAtMs: number
  uses?: number
}): Promise<TradeCreation> {
  const { signer, item, usdPrice, expiresAtMs } = opts
  const creator = (await signer.getAddress()).toLowerCase()

  const market = getContract(ContractName.OffChainMarketplaceV2, item.chainId)
  const mana = getContract(ContractName.MANAToken, item.chainId)

  // Read signature indices from the target-chain RPC (not the wallet's network).
  const marketC = new ethers.Contract(market.address, INDEX_ABI, readProvider()) as IndexContract
  const contractSignatureIndex = await marketC.contractSignatureIndex()
  const signerSignatureIndex = await marketC.signerSignatureIndex(creator)

  // One signed listing mints up to `uses` units. Default to the whole remaining run (min 1).
  const uses = Math.max(1, Math.floor(opts.uses ?? 1))

  const tradeToSign: Omit<TradeCreation, 'signature'> = {
    signer: creator,
    network: item.network,
    chainId: item.chainId,
    type: TradeType.PUBLIC_ITEM_ORDER,
    checks: {
      uses,
      expiration: expiresAtMs,
      effective: Date.now(),
      salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      contractSignatureIndex: contractSignatureIndex.toNumber(),
      signerSignatureIndex: signerSignatureIndex.toNumber(),
      allowedRoot: '0x',
      externalChecks: []
    },
    sent: [
      {
        assetType: TradeAssetType.COLLECTION_ITEM,
        contractAddress: item.contractAddress,
        itemId: item.itemId,
        extra: ''
      }
    ],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: mana.address,
        amount: ethers.utils.parseEther(String(usdPrice)).toString(),
        extra: '',
        beneficiary: creator
      }
    ]
  }

  const domain = {
    name: market.name,
    version: market.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(item.chainId), 32),
    verifyingContract: market.address
  }

  const signature = await signer._signTypedData(domain, OFFCHAIN_MARKETPLACE_TYPES, generateTradeValues(tradeToSign))

  return { ...tradeToSign, signature }
}
