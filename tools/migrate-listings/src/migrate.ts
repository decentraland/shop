import { ethers } from 'ethers'
import { ContractName, getContract } from './dcl-transactions'
import { config, type CancelMode, type RoundMode } from './config'
import { fetchOpenErc20ItemOrders, fetchOpenErc20Orders, type EnumerateScope } from './enumerate'
import { formatUsd, manaWeiToUsdWei, readOracle, roundUsdWei, usdWeiToCredits } from './oracle'
import { buildUsdPeggedTrade } from './prepare'
import { isAlreadyUsdListed, type ShopFeedCache } from './shopFeed'
import type { MigrationSigner } from './signer'
import type { ClassicListing, MigrationEntry, OracleSnapshot } from './types'

// Stable idempotency key per (item, seller, chain) — independent of price/salt (MIGRATION_SPEC §8).
function idempotencyKey(l: ClassicListing): string {
  const market = getContract(ContractName.OffChainMarketplaceV2, l.chainId)
  const target = l.tokenId ?? l.itemId ?? ''
  const parts = [l.chainId, market.address, l.listingType, l.contractAddress, target, l.seller].join('|').toLowerCase()
  return ethers.utils.id(parts)
}

export type PrepareOptions = {
  scope: EnumerateScope
  round: RoundMode
  includeExpired: boolean
  expirationDays: number
  includePrimary: boolean // requires DB access (--source db)
}

/**
 * The automatable half of migration (MIGRATION_SPEC §4): enumerate → dedupe → price via oracle →
 * build unsigned USD-pegged payloads. Produces no signatures and touches no wallet. Safe for
 * --dry-run and for the Shop UI to call before showing the conversion table.
 */
export async function prepareMigration(
  opts: PrepareOptions
): Promise<{ oracle: OracleSnapshot; entries: MigrationEntry[] }> {
  const oracle = await readOracle(config.chainId)

  const secondary = await fetchOpenErc20Orders(opts.scope)
  const primary = opts.includePrimary ? await fetchOpenErc20ItemOrders(opts.scope) : []
  const listings = [...secondary, ...primary]

  const dedupeCache: ShopFeedCache = new Map()
  const seenInRun = new Set<string>()
  const entries: MigrationEntry[] = []

  for (const listing of listings) {
    const key = idempotencyKey(listing)
    const entry: MigrationEntry = { key, source: listing, status: 'PREPARED' }

    // In-run dedupe (same item twice).
    if (seenInRun.has(key)) {
      entry.status = 'SKIP_ALREADY_USD'
      entry.note = 'duplicate within run'
      entries.push(entry)
      continue
    }
    seenInRun.add(key)

    try {
      // Expiry.
      const expired = listing.expiresAtMs <= Date.now()
      if (expired && !opts.includeExpired) {
        entry.status = 'SKIP_EXPIRED'
        entries.push(entry)
        continue
      }

      // Cross-listing dedupe against the Shop feed.
      const dedupe = await isAlreadyUsdListed(listing, dedupeCache)
      if (dedupe.alreadyListed) {
        entry.status = 'SKIP_ALREADY_USD'
        entries.push(entry)
        continue
      }
      if (!dedupe.feedAvailable) {
        entry.note = 'shop feed unavailable — dedupe skipped'
      }

      // Zero / unreadable price guard.
      let usdWei: bigint
      try {
        const raw = manaWeiToUsdWei(listing.manaWei, oracle)
        if (raw <= 0n) throw new Error('non-positive USD price')
        usdWei = roundUsdWei(raw, opts.round)
      } catch (e) {
        entry.status = 'ERROR'
        entry.note = `price: ${(e as Error).message}`
        entries.push(entry)
        continue
      }

      entry.usdWei = usdWei.toString()
      entry.usdDisplay = formatUsd(usdWei)
      entry.credits = usdWeiToCredits(usdWei)

      const expiresAtMs =
        expired || !listing.expiresAtMs
          ? Date.now() + opts.expirationDays * 24 * 60 * 60 * 1000
          : listing.expiresAtMs

      entry.prepared = await buildUsdPeggedTrade({ listing, usdWei, expiresAtMs })
      entry.status = 'PREPARED'
    } catch (e) {
      entry.status = 'ERROR'
      entry.note = (e as Error).message
    }
    entries.push(entry)
  }

  return { oracle, entries }
}

export type RunOptions = {
  signer: MigrationSigner
  authHeaders: Record<string, string>
  cancelMode: CancelMode
}

/**
 * The seller-assisted half: for each PREPARED entry, sign (seller wallet) → POST → optionally cancel
 * the old classic listing per cancelMode (MIGRATION_SPEC §6). Mutates + returns the entries with
 * newTradeId / cancelledOldTx / status. Requires a real (non-Null) signer + auth headers.
 */
export async function runMigration(
  entries: MigrationEntry[],
  opts: RunOptions,
  postTrade: (t: import('@dcl/schemas').TradeCreation, h: Record<string, string>) => Promise<
    { ok: true; tradeId: string } | { ok: false; status: number; message: string }
  >
): Promise<MigrationEntry[]> {
  for (const entry of entries) {
    if (entry.status !== 'PREPARED' || !entry.prepared) continue

    // cancel-first ordering (primary re-price / safest against double-buy).
    if (opts.cancelMode === 'cancel-first' && entry.source.oldTradeId && opts.signer.cancelOld) {
      entry.cancelledOldTx = await opts.signer.cancelOld(entry.source.oldTradeId)
      entry.status = 'OLD_CANCELLED'
    }

    const signed = await opts.signer.signTrade(entry.prepared)
    entry.status = 'SIGNED'

    const posted = await postTrade(signed, opts.authHeaders)
    if (!posted.ok) {
      if (/duplicate/i.test(posted.message)) {
        entry.status = 'SKIP_ALREADY_USD'
        entry.note = posted.message
        continue
      }
      entry.status = 'ERROR'
      entry.note = posted.message
      continue
    }
    entry.newTradeId = posted.tradeId
    entry.status = 'POSTED'

    if (opts.cancelMode === 'after-post' && entry.source.oldTradeId && opts.signer.cancelOld) {
      entry.cancelledOldTx = await opts.signer.cancelOld(entry.source.oldTradeId)
      entry.status = 'OLD_CANCELLED'
    }
  }
  return entries
}
