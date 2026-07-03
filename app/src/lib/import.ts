import { ChainId, Network } from '@dcl/schemas'
import { config } from '~/config'
import type { Session } from '~/lib/auth'
import { fetchTrade, postTrade } from '~/lib/api'
import { cancelListing } from '~/lib/buy'
import { manaWeiToCredits, readManaUsdRate } from '~/lib/mana-rate'
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

/** The seller's importable listings, split into creations (primary) + owned (secondary). */
export async function fetchImportable(seller: string): Promise<{ creations: ImportItem[]; owned: ImportItem[] }> {
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/importable?seller=${seller.toLowerCase()}`)
  if (!res.ok) throw new Error(`fetchImportable ${res.status}`)
  const { data } = (await res.json()) as { data: ImportListing[] }
  const listings = data ?? []
  if (listings.length === 0) return { creations: [], owned: [] }

  const chainId = listings[0].chainId || config.chainId
  const rate = await readManaUsdRate(chainId)
  const items: ImportItem[] = listings.map(l => ({ ...l, suggestedCredits: manaWeiToCredits(l.manaWei, rate) }))

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
