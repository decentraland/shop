# The Shop — Local end-to-end runbook

> How to run the full Shop economy locally against **Amoy**. Isolated from your mainnet
> credits-server setup (uses a dedicated `shop_credits` DB). Phased — validate each phase
> before the next.

## Stack

| Component | Role | Port |
|---|---|---|
| Postgres (Postgres.app, user `juanma`) | DB `shop_credits` (schemas `public` = credits-server, `squid_credits` = squid) | 5432 |
| `credits-squid-core` (legacy Subsquid SDK) | indexes Amoy `CreditUsed` → `squid_credits.credit_consumption` | 3009 (metrics) |
| `credits-server` | signs/serves credits, reads consumption cross-schema | 3000 |
| `marketplace-server` | catalog + accepts USD-pegged trades | 5003 |
| `shop/app` | UI (sell / buy) | 5173 (vite) |
| `shop/server` | treasury + Stripe (later phases) | tbd |

Amoy addrs: CreditsManager `0x8052a560e6e6ac86eeb7e711a4497f639b322fb3` · MANA `0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0` · MANA/USD oracle `0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e` · offchain V4 `0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7`.

---

## Key wiring facts (learned the hard way)

- **credits-server ↔ squid share ONE database**, two schemas: credits-server writes `public.user_credits` etc.; the squid writes `squid_credits.credit_consumption`. credits-server reads consumption via a hardcoded cross-schema reference (`SQUID_CREDITS_SCHEMA='squid_credits'` in `src/adapters/db/db.ts`).
- **This squid version ignores `DB_SCHEMA` for the DATA tables** — it uses the connection's `search_path` (prod does `ALTER USER ... SET search_path` in `indexer.sh`). Locally we force it per-connection via the DB_URL `options` param. `DB_SCHEMA` still names the processor-status schema (`squid_credits_processor`).
- The squid needs an infra table **`public.squids`** (Slack rate-limit) that the TypeORM migrations do NOT create. Create it manually (below), else every batch fails with `relation "public.squids" does not exist`.
- credits-server is pointed at Amoy + `shop_credits` via **command-line env overrides only — the `.env` (your mainnet/Across setup) is never touched.**

---

## One-time setup

```
psql -d postgres -c "CREATE DATABASE shop_credits"
psql shop_credits -c "CREATE SCHEMA IF NOT EXISTS squid_credits"
```

Squid schema (data tables into `squid_credits` via search_path):
```
cd /Users/juanma/Projects/dcl/credits-squid-core && DB_URL="postgresql://juanma@localhost:5432/shop_credits?options=-c%20search_path%3Dsquid_credits" DB_SCHEMA=squid_credits POLYGON_CHAIN_ID=80002 npx squid-typeorm-migration apply
```

credits-server schema (into `public`) + the infra `squids` table:
```
cd /Users/juanma/Projects/dcl/credits-server && DATABASE_URL="postgresql://juanma@localhost:5432/shop_credits" yarn db:migrate up
psql shop_credits -c "CREATE TABLE IF NOT EXISTS public.squids (name text PRIMARY KEY, last_notified bigint); INSERT INTO public.squids (name, last_notified) VALUES ('credits', 0) ON CONFLICT (name) DO NOTHING;"
```

---

## Run (one terminal each)

Squid (indexes Amoy from block 20612932; ~30s to head):
```
cd /Users/juanma/Projects/dcl/credits-squid-core && DB_URL="postgresql://juanma@localhost:5432/shop_credits?options=-c%20search_path%3Dsquid_credits" DB_SCHEMA=squid_credits POLYGON_CHAIN_ID=80002 node --require=dotenv/config lib/main.js
```

credits-server (:3000, Amoy, dev-mint on; overrides your .env without editing it):
```
cd /Users/juanma/Projects/dcl/credits-server && PG_COMPONENT_PSQL_DATABASE=shop_credits PG_COMPONENT_PSQL_USER=juanma NOTIFICATIONS_PG_COMPONENT_PSQL_DATABASE=shop_credits NOTIFICATIONS_PG_COMPONENT_PSQL_USER=juanma CHAIN_ID=80002 RPC_ENDPOINT_POLYGON=https://rpc.decentraland.org/amoy CREDITS_MANAGER_ADDRESS_OVERRIDE= CREDIT_EXECUTOR_ACROSS_ADDRESS_OVERRIDE= HTTP_SERVER_PORT=3000 yarn start
```

Background jobs may log `No active season found` — harmless (we don't seed seasons; the Shop uses on-demand/USD credits, not season goals).

---

## Validation

```
curl -s localhost:3000/status
curl -s -X POST localhost:3000/dev/mint-credit -H "Content-Type: application/json" -d '{"address":"0x1111111111111111111111111111111111111111","amount":1000,"reason":"test"}'
psql shop_credits -tAc "select id, user_address, amount, contract from public.user_credits order by timestamp desc limit 3"
psql shop_credits -tAc "select count(*) from squid_credits.credit_consumption"
```

Expected: `/status` OK; dev-mint returns a `creditId`+`signature`; the row is in `user_credits` with `contract=0x8052…` (Amoy); consumption count > 0 (real Amoy `CreditUsed` events).

**Fase 0 status: DONE** — indexer loop + credits-server wiring proven on Amoy.

---

## Remaining validation (live round-trip) — gated on the signer role

To prove a *fresh* dev-mint credit gets consumed and its `availableAmount` drops:
1. The credits-server `PRIVATE_KEY` (signer) must hold **`CREDITS_SIGNER_ROLE`** on the Amoy CreditsManager `0x8052…`. (On mainnet you use the test manager `0x919af8…`; on Amoy it must be granted on `0x8052`.)
2. A listed item + a **second wallet** (the CreditsManager anti-abuse blocks buying your own listing).
3. dev-mint to wallet B → buy the listing in the shop app → squid indexes the `CreditUsed` → `availableAmount` for that credit drops.

## Next phases
- **Fase 1**: implement the USD-denomination changes in credits-server (see `CREDITS_CANONICAL_MODEL.md`), behind a feature flag.
- **Fase 2**: wire the shop app to the USD path + a dev-mint for USD credits.
- **Fase 3**: full e2e dry run (no Stripe/treasury).
- **Fase 4**: add `shop-server` treasury + Stripe test-mode.
