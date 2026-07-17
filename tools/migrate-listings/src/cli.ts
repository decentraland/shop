#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config, type CancelMode, type RoundMode, type Source } from './config'
import { prepareMigration, runMigration } from './migrate'
import { postTrade } from './api'
import { NullSigner } from './signer'
import type { MigrationEntry } from './types'

type Args = {
  seller?: string
  collection?: string
  dryRun: boolean
  source: Source
  round: RoundMode
  cancelOld: CancelMode
  includeExpired: boolean
  expirationDays: number
  out?: string
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    dryRun: false,
    source: 'api',
    round: 'credit',
    cancelOld: 'after-post',
    includeExpired: false,
    expirationDays: config.defaultExpirationDays,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '--seller':
        a.seller = next()
        break
      case '--collection':
        a.collection = next()
        break
      case '--dry-run':
        a.dryRun = true
        break
      case '--source':
        a.source = next() as Source
        break
      case '--round':
        a.round = next() as RoundMode
        break
      case '--cancel-old':
        a.cancelOld = next() as CancelMode
        break
      case '--include-expired':
        a.includeExpired = true
        break
      case '--expiration-days':
        a.expirationDays = Number(next())
        break
      case '--out':
        a.out = next()
        break
      case '-h':
      case '--help':
        a.help = true
        break
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`)
    }
  }
  return a
}

const HELP = `
migrate-listings — convert classic MANA (ERC20) listings into USD-pegged (credit-buyable) Shop listings.

USAGE
  migrate-listings (--seller <address> | --collection <contractAddress>) [options]

SCOPE (pick one)
  --seller <address>          all of one wallet's open classic listings
  --collection <address>      all open classic listings of one collection

OPTIONS
  --dry-run                   enumerate + price + prepare only; sign/post NOTHING; print the table
  --source api|db             enumeration source (default: api; db enables primary item orders)
  --round credit|up|down|none price rounding (default: credit = nearest whole credit / $0.10)
  --cancel-old after-post|cancel-first|keep   old-listing policy (default: after-post)
  --include-expired           also re-list expired classic listings (with a fresh expiration)
  --expiration-days <n>       fresh expiration when re-listing (default: ${config.defaultExpirationDays})
  --out <file>                write the JSON run report here (default: ./out/migration-<scope>-<ts>.json)
  -h, --help                  this help

NOTE
  A migrated listing needs a NEW signature from the ORIGINAL SELLER's wallet — no server/admin key
  can produce it (see design/MIGRATION_SPEC.md §4). This CLI's real (non-dry) run therefore needs a
  wallet-backed signer + auth headers injected; --dry-run runs the full read/convert/prepare pipeline
  with zero wallet interaction.

ENV (fake defaults for Amoy testnet)
  MARKETPLACE_SERVER_URL   read /v1/orders + POST /v1/trades      (default: .zone)
  RPC_URL                  read-only RPC for oracle + indices     (default: rpc-amoy)
  CHAIN_ID                 target chain                           (default: 80002)
  MANA_USD_AGGREGATOR      fallback oracle if on-chain read fails (default: Amoy mock)
`

function printTable(entries: MigrationEntry[]): void {
  const priced = entries.filter(e => e.usdWei)
  const rows = priced.map(e => {
    const target = e.source.tokenId ? `#${e.source.tokenId}` : `item ${e.source.itemId}`
    return {
      type: e.source.listingType,
      item: `${short(e.source.contractAddress)} ${target}`,
      seller: short(e.source.seller),
      newPrice: `${e.usdDisplay} (${e.credits} cr)`,
      status: e.status,
    }
  })
  if (rows.length === 0) {
    console.log('\n(no priceable candidates)')
  } else {
    console.log('\nConversion table (MANA → USD):')
    console.table(rows)
  }

  const counts: Record<string, number> = {}
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1
  console.log('\nSummary:', counts, `\nTotal candidates: ${entries.length}`)
}

function short(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  if (!args.seller && !args.collection) {
    console.error('Error: pass exactly one of --seller <address> or --collection <address>. Use --help.')
    process.exit(1)
  }
  if (args.seller && args.collection) {
    console.error('Error: pass only one of --seller / --collection.')
    process.exit(1)
  }

  const scope = { seller: args.seller, collection: args.collection }
  console.log(
    `Reading open classic listings for ${args.seller ? 'seller' : 'collection'} ${args.seller ?? args.collection}`
  )
  console.log(`Server: ${config.marketplaceServerUrl} · chain: ${config.chainId} · round: ${args.round}`)

  const { oracle, entries } = await prepareMigration({
    scope,
    round: args.round,
    includeExpired: args.includeExpired,
    expirationDays: args.expirationDays,
    includePrimary: args.source === 'db',
  })

  console.log(
    `\nOracle: rate=${oracle.rate} (1e${oracle.decimals}) @ ${new Date(oracle.readAtMs).toISOString()} · ${oracle.aggregatorAddress}`
  )
  printTable(entries)

  if (!args.dryRun) {
    // Real run needs the seller's wallet + auth headers. This CLI ships the seam but not a headless
    // wallet — a headless run would require a local key + signed auth-chain headers to be wired here.
    // The Shop UI injects both (walletSignerFromEthers + TradeService headers). See README.
    const signer = new NullSigner()
    void runMigration
    void postTrade
    void signer
    console.error(
      '\nNo wallet-backed signer configured — this CLI ran in prepare-only mode (same as --dry-run).\n' +
        'To actually sign + post, drive prepareMigration()/runMigration() from the Shop UI with an\n' +
        'injected walletSignerFromEthers(sellerSigner) + auth headers. See README "Integration".'
    )
  }

  // Write the JSON run report (resumable state, MIGRATION_SPEC §8).
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const scopeLabel = (args.seller ?? args.collection ?? 'all').toLowerCase().slice(0, 12)
  const outPath = args.out ? resolve(args.out) : resolve('out', `migration-${scopeLabel}-${ts}.json`)
  mkdirSync(resolve(outPath, '..'), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ oracle, entries }, null, 2))
  console.log(`\nReport written: ${outPath}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
