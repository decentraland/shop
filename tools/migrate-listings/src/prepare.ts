import { ethers } from 'ethers'
import { TradeAssetType, TradeType, type TradeCreation } from '@dcl/schemas'
import { ContractName, getContract } from './dcl-transactions'
import { readProvider } from './oracle'
import type { ClassicListing } from './types'

// Port of the minimal trade-building logic from shop/app/src/lib/trades.ts. Copied (not imported)
// on purpose — the tool must not depend fragilely on the Shop app's build. The EIP-712 domain/types
// and the ms→s conversion MUST stay byte-identical to the Shop app, or signatures won't verify.
// If shop/app/src/lib/trades.ts changes its domain/types, mirror the change here.

const toSeconds = (ms: number) => Math.floor(ms / 1000)

export const OFFCHAIN_MARKETPLACE_TYPES = {
  Trade: [
    { name: 'checks', type: 'Checks' },
    { name: 'sent', type: 'AssetWithoutBeneficiary[]' },
    { name: 'received', type: 'Asset[]' },
  ],
  Asset: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' },
    { name: 'beneficiary', type: 'address' },
  ],
  AssetWithoutBeneficiary: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' },
  ],
  Checks: [
    { name: 'uses', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'effective', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'contractSignatureIndex', type: 'uint256' },
    { name: 'signerSignatureIndex', type: 'uint256' },
    { name: 'allowedRoot', type: 'bytes32' },
    { name: 'externalChecks', type: 'ExternalCheck[]' },
  ],
  ExternalCheck: [
    { name: 'contractAddress', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'value', type: 'bytes' },
    { name: 'required', type: 'bool' },
  ],
}

// USD_PEGGED_MANA-aware value extractor (dapps' getValueForTradeAsset has no USD case). Mirrors
// shop/app/src/lib/trades.ts:valueForAsset.
function valueForAsset(asset: {
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
      throw new Error(`Unsupported assetType ${asset.assetType}`)
  }
}

// EIP-712 values the signer signs over. Mirrors shop/app generateTradeValues (ms→s conversion is
// the load-bearing part — the contract checks block.timestamp in seconds).
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
        required: c.required,
      })),
    },
    sent: trade.sent.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x',
    })),
    received: trade.received.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x',
      beneficiary: (a as { beneficiary?: string }).beneficiary,
    })),
  }
}

const INDEX_ABI = [
  'function contractSignatureIndex() view returns (uint256)',
  'function signerSignatureIndex(address) view returns (uint256)',
]

export function eip712Domain(chainId: number) {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  return {
    name: market.name,
    version: market.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
    verifyingContract: market.address,
  }
}

// Read the revocation counters from the target-chain RPC. Prepare-time read; the real wallet path
// should re-read signerSignatureIndex right before signing (MIGRATION_SPEC §8).
async function readSignatureIndices(
  chainId: number,
  signer: string
): Promise<{ contractIdx: number; signerIdx: number }> {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  const c = new ethers.Contract(market.address, INDEX_ABI, readProvider())
  const contractIdx: ethers.BigNumber = await c.contractSignatureIndex()
  const signerIdx: ethers.BigNumber = await c.signerSignatureIndex(signer)
  return { contractIdx: contractIdx.toNumber(), signerIdx: signerIdx.toNumber() }
}

export type PreparedTrade = {
  trade: Omit<TradeCreation, 'signature'>
  domain: Record<string, unknown>
  types: typeof OFFCHAIN_MARKETPLACE_TYPES
}

/**
 * Build the unsigned USD-pegged TradeCreation for a classic listing. Secondary → PUBLIC_NFT_ORDER
 * (sent ERC721); primary → PUBLIC_ITEM_ORDER (sent COLLECTION_ITEM). Received is always
 * USD_PEGGED_MANA at `usdWei`. Returns the payload + EIP-712 material for the injected signer.
 */
export async function buildUsdPeggedTrade(opts: {
  listing: ClassicListing
  usdWei: bigint
  expiresAtMs: number
}): Promise<PreparedTrade> {
  const { listing, usdWei, expiresAtMs } = opts
  const seller = listing.seller.toLowerCase()
  const chainId = listing.chainId
  const mana = getContract(ContractName.MANAToken, chainId)
  const { contractIdx, signerIdx } = await readSignatureIndices(chainId, seller)

  const isPrimary = listing.listingType === 'primary'
  const uses = isPrimary ? Math.max(1, Math.floor(listing.remainingSupply ?? 1)) : 1

  const sent = isPrimary
    ? [
        {
          assetType: TradeAssetType.COLLECTION_ITEM,
          contractAddress: listing.contractAddress,
          itemId: listing.itemId as string,
          extra: '',
        },
      ]
    : [
        {
          assetType: TradeAssetType.ERC721,
          contractAddress: listing.contractAddress,
          tokenId: listing.tokenId as string,
          extra: '',
        },
      ]

  const trade: Omit<TradeCreation, 'signature'> = {
    signer: seller,
    network: listing.network,
    chainId,
    type: isPrimary ? TradeType.PUBLIC_ITEM_ORDER : TradeType.PUBLIC_NFT_ORDER,
    checks: {
      uses,
      expiration: expiresAtMs,
      effective: Date.now(),
      salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      contractSignatureIndex: contractIdx,
      signerSignatureIndex: signerIdx,
      allowedRoot: '0x',
      externalChecks: [],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sent: sent as any,
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: mana.address,
        amount: usdWei.toString(),
        extra: '',
        beneficiary: seller,
      },
    ],
  }

  return { trade, domain: eip712Domain(chainId), types: OFFCHAIN_MARKETPLACE_TYPES }
}
