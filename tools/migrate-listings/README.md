# migrate-listings

Converts the classic marketplace's **MANA (ERC20) listings** into **USD-pegged (credit-buyable)
listings** so they appear in and are buyable in **the Shop**.

The Shop's v3 catalog (`/v3/catalog/shop`) only returns listings whose **received asset type = 2
(`USD_PEGGED_MANA`)**. Classic listings are priced in `ERC20` (asset type 1), so they're invisible
in the Shop even though the item and marketplace are the same. This tool bridges that gap.

Full strategy + edge cases: **`../../design/MIGRATION_SPEC.md`**.

---

## The one hard constraint (read this first)

> **A migrated listing needs a NEW signature from the ORIGINAL SELLER's wallet. No server, script, or
> admin key can produce it.**

A listing is an EIP-712-signed off-chain trade. Changing its price side from `ERC20` to
`USD_PEGGED_MANA` changes the signed payload, so it must be re-signed by the seller. Migration is
therefore **seller-initiated / seller-assisted**.

This tool does everything a machine *can* do without the seller:

1. **Enumerate** a seller's / collection's open classic listings.
2. **Price** each in USD via the on-chain MANA/USD oracle (the same one the contract settles with).
3. **Prepare** the exact unsigned `TradeCreation` payloads (USD-pegged), deduped and validated.
4. **Dry-run** prints a plain conversion table and writes a JSON report.

The only remaining step — **one wallet signature per listing** (plus an optional cancel of the old
one) — is isolated behind an **injectable `MigrationSigner`** (`src/signer.ts`), so the Shop UI plugs
in the connected seller's wallet and everything else is reused verbatim.

---

## How to run

Install and dry-run against Amoy testnet (fake defaults, reads from `.zone`, signs nothing):

```
cd shop/tools/migrate-listings
npm install
npm run dry-run -- --seller 0xSELLER0000000000000000000000000000000000
```

Or scope by collection:

```
npm run dry-run -- --collection 0xCOLLECTION00000000000000000000000000000000
```

Type-check / build:

```
npm run typecheck
npm run build            # emits dist/, then: node dist/cli.js --dry-run --seller 0x...
```

### Common options

```
--seller <address> | --collection <address>   scope (pick one)
--dry-run                                      prepare only; sign/post NOTHING
--round credit|up|down|none                    price rounding (default: nearest whole credit, $0.10)
--cancel-old after-post|cancel-first|keep      old-listing policy (default: after-post)
--include-expired                              re-list expired listings with a fresh expiration
--expiration-days <n>                          fresh expiration (default: 180)
--source api|db                                api (secondary, default) or db (adds primary items)
--out <file>                                   run report path
```

### Env (all have fake Amoy defaults; NO secrets in this repo)

```
MARKETPLACE_SERVER_URL   read /v1/orders + POST /v1/trades   (default: https://marketplace-api.decentraland.zone)
RPC_URL                  oracle + signature-index reads       (default: https://rpc-amoy.polygon.technology)
CHAIN_ID                 target chain                         (default: 80002)
MANA_USD_AGGREGATOR      fallback oracle if on-chain read fails (default: Amoy mock 0xdcf0…416e)
```

`--source db` additionally reads `DAPPS_PG_COMPONENT_PSQL_CONNECTION_STRING` from the environment
(read-only; never written, never logged). Point it at the local DAPPS DB
(`localhost:8020/dapps`, schema `marketplace` + `squid_marketplace`).

### Example dry-run output

```
Oracle: rate=26960000 (1e8) @ 2026-07-02T… · 0xdcf0…416e

Conversion table (MANA → USD):
┌─────────┬───────────┬──────────────────────┬──────────┬──────────────────────┬──────────┐
│  type   │   item    │        seller        │ newPrice │        status        │          │
├─────────┼───────────┼──────────────────────┼──────────┼──────────────────────┼──────────┤
│secondary│ 0xabc… #42│ 0x1234…cdef           │ $27.00 (270 cr)        │       PREPARED        │
└─────────┴───────────┴──────────────────────┴──────────┴──────────────────────┴──────────┘

Summary: { PREPARED: 6, SKIP_ALREADY_USD: 2, SKIP_EXPIRED: 1 } 
Total candidates: 9
Report written: out/migration-0xseller0000-2026-07-02T….json
```

---

## Integration & next steps

The CLI runs the read/convert/prepare pipeline (`prepareMigration`) and the report. To actually
**sign + post** (the seller-assisted half), drive the library from the **Shop UI** where the seller
is already connected:

1. **Enumerate + prepare** (no wallet): `prepareMigration({ scope, round, ... })` → `{ oracle,
   entries }`. Show `entries` as the "Move to the Shop" conversion table (MIGRATION_SPEC §5). Copy is
   web2-first: show `usdDisplay` / `credits` only, never MANA.
2. **Inject the seller's wallet** as the signer:
   ```ts
   import { walletSignerFromEthers } from './signer'
   const migSigner = walletSignerFromEthers(await web3Provider.getSigner(), cancelOld)
   ```
   `signTrade` reuses the Shop app's exact `generateTradeValues` + EIP-712 domain/types, so the
   signature verifies on-chain identically to `shop/app/src/lib/trades.ts`.
3. **Post** each signed trade with the Shop's authenticated path. The CLI's `postTrade` leaves auth
   header construction to the caller to stay dependency-light; in the Shop, reuse
   `shop/app/src/lib/api.ts:postTrade` (decentraland-dapps `TradeService`, intent `dcl:create-trade`)
   instead — it already attaches the auth-chain headers from `session.identity`.
4. **Cancel old** per `--cancel-old` mode: implement `cancelOld` by mirroring
   `shop/app/src/lib/buy.ts:cancelListing` (fetch the old `Trade`, `marketplace.cancelSignature`).
   Pass it into `walletSignerFromEthers`. `runMigration(entries, { signer, authHeaders, cancelMode },
   postTrade)` then orders sign → post → cancel correctly.

### Wiring checklist to move this into the Shop

- [ ] Add a `useMigrateListings` hook / "Move to the Shop" banner in My Assets that calls
      `prepareMigration` and renders `entries`.
- [ ] Reuse `shop/app/src/lib/api.ts:postTrade` (auth headers) instead of this tool's `postTrade`.
- [ ] Implement `cancelOld` from `buy.ts:cancelListing`; wire the `NEEDS_APPROVAL` /
      `NEEDS_MINTER` pre-steps (`trades.ts:ensureApproval` / `ensureMinter`) before posting.
- [ ] Enable **primary** items: implement the `--source db` stub in `src/enumerate.ts`
      (`fetchOpenErc20ItemOrders`) with a `node-postgres` read of
      `getTradesForTypeQuery(PUBLIC_ITEM_ORDER)`, or add a `/v1/orders`-style server endpoint that
      indexes item orders.
- [ ] Consider a relayer for the **cancel** step (gasless) to cut approvals further (the *listing*
      signature is still the seller's — that's irreducible).

### Files

| File | Role |
|---|---|
| `src/config.ts` | env-driven config, credit math constant |
| `src/enumerate.ts` | read open classic listings (`/v1/orders`; DB stub for primary) |
| `src/oracle.ts` | read MANA/USD oracle, MANA→USD math, rounding |
| `src/prepare.ts` | build unsigned USD-pegged `TradeCreation` (ported from shop app trades.ts) |
| `src/shopFeed.ts` | dedupe: is this item already USD-listed in the Shop? |
| `src/signer.ts` | the injectable seller-signature seam (`MigrationSigner`, `NullSigner`) |
| `src/api.ts` | POST a signed trade to `/v1/trades` |
| `src/migrate.ts` | orchestration: `prepareMigration` + `runMigration` + idempotency key |
| `src/cli.ts` | CLI, `--dry-run` table, JSON report |

> **Reuse note:** the trade-building + EIP-712 logic in `src/prepare.ts` and `src/signer.ts` is
> **copied** from `shop/app/src/lib/trades.ts` (not imported across repos) so this tool builds
> standalone. If the Shop app changes its EIP-712 domain/types or `generateTradeValues`, mirror the
> change here or signatures won't verify.
