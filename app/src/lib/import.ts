import { ethers } from 'ethers'
import { ChainId, Network } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'
import { config } from '~/config'
import type { Session } from '~/lib/auth'
import { fetchTrade, postTrade } from '~/lib/api'
import { cancelListing } from '~/lib/buy'
import {
  createPrimaryUsdPeggedListing,
  createUsdPeggedListing,
  ensureApproval,
  ensureMinter
} from '~/lib/trades'

// "Import your listings": bring a seller's OLD classic (MANA-priced) listings into the Shop as
// credit-buyable. The server returns the raw price; we convert MANA→credits here via the oracle
// (mirrors the migrate-listings tool). Re-listing reuses the same signing path as selling.

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182
const USD_WEI_PER_CREDIT = 10n ** 17n // 1 credit = $0.10 = 1e17 USD wei

// Server shape (GET /v3/catalog/importable).
export type ImportListing = {
  oldTradeId: string
  listingType: 'primary' | 'secondary'
  contractAddress: string
  itemId: string | null
  tokenId: string | null
  name: string
  thumbnail: string
  rarity: string
  category: string
  wearableCategory: string | null
  manaWei: string
  available: number
  network: string
  chainId: number
}

// With the auto-converted (rounded-up) suggested price in credits.
export type ImportItem = ImportListing & { suggestedCredits: number }

// Read the MANA/USD oracle once (off the marketplace contract, like buy.ts). Inverse of buy.ts:
// here we go MANA→USD.
async function readManaUsdRate(chainId: number): Promise<{ rate: bigint; decimals: number }> {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const mkt = new ethers.Contract(market.address, ['function manaUsdAggregator() view returns (address)'], provider)
  const aggAddr: string = await mkt.manaUsdAggregator()
  const agg = new ethers.Contract(
    aggAddr,
    ['function decimals() view returns (uint8)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'],
    provider
  )
  const decimals: number = await agg.decimals()
  const rd = await agg.latestRoundData()
  return { rate: BigInt(rd[1].toString()), decimals: Number(decimals) }
}

// MANA wei → credits, rounded UP, floored at 1 credit. usdWei = manaWei * rate / 10^decimals.
function toCreditsRoundedUp(manaWei: string, rate: bigint, decimals: number): number {
  let usdWei: bigint
  try {
    usdWei = (BigInt(manaWei) * rate) / 10n ** BigInt(decimals)
  } catch {
    return 1
  }
  const whole = usdWei / USD_WEI_PER_CREDIT
  const credits = usdWei % USD_WEI_PER_CREDIT > 0n ? whole + 1n : whole
  const n = Number(credits)
  return n < 1 ? 1 : n
}

/** The seller's importable listings, split into creations (primary) + owned (secondary). */
export async function fetchImportable(seller: string): Promise<{ creations: ImportItem[]; owned: ImportItem[] }> {
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/importable?seller=${seller.toLowerCase()}`)
  if (!res.ok) throw new Error(`fetchImportable ${res.status}`)
  const { data } = (await res.json()) as { data: ImportListing[] }
  const listings = data ?? []
  if (listings.length === 0) return { creations: [], owned: [] }

  const chainId = listings[0].chainId || config.chainId
  const { rate, decimals } = await readManaUsdRate(chainId)
  const items: ImportItem[] = listings.map(l => ({ ...l, suggestedCredits: toCreditsRoundedUp(l.manaWei, rate, decimals) }))

  return {
    creations: items.filter(i => i.listingType === 'primary'),
    owned: items.filter(i => i.listingType === 'secondary')
  }
}

/**
 * List ONE old item into the Shop at `priceCredits`. Reuses the exact selling path:
 * - primary (a creation): ensure the Shop can mint the collection, then sign + post a USD item order.
 * - secondary (owned): ensure the Shop can transfer it, then sign + post a USD nft order.
 * The first item of a collection may need a one-time approval; later items skip it.
 * `cancelOld` (default off) additionally takes the old classic listing down (an extra confirmation).
 */
export async function importListing(
  item: ImportItem,
  priceCredits: number,
  session: Session,
  opts: { cancelOld?: boolean } = {}
): Promise<void> {
  const usdPrice = priceCredits / 10 // credits → USD (1 credit = $0.10)
  const chainId = item.chainId as ChainId
  const network = item.network as Network

  if (item.listingType === 'primary') {
    await ensureMinter({ signer: session.signer, contractAddress: item.contractAddress, chainId })
    const trade = await createPrimaryUsdPeggedListing({
      signer: session.signer,
      item: { contractAddress: item.contractAddress, itemId: item.itemId ?? '', network, chainId },
      usdPrice,
      uses: item.available,
      expiresAtMs: Date.now() + SIX_MONTHS_MS
    })
    await postTrade(trade, session.identity)
  } else {
    await ensureApproval({ signer: session.signer, contractAddress: item.contractAddress, chainId })
    const trade = await createUsdPeggedListing({
      signer: session.signer,
      nft: { contractAddress: item.contractAddress, tokenId: item.tokenId ?? '', network, chainId },
      usdPrice,
      expiresAtMs: Date.now() + SIX_MONTHS_MS
    })
    await postTrade(trade, session.identity)
  }

  if (opts.cancelOld) {
    const old = await fetchTrade(item.oldTradeId).catch(() => null)
    if (old) await cancelListing({ trade: old, signer: session.signer })
  }
}
