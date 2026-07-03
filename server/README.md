# shop-server — the Shop treasury

The treasury / settlement backend for the Decentraland **Shop** (Roblox-style marketplace:
fixed USD prices, buy with a card, MANA settles underneath). This service is the **treasury**:
it keeps the audited `CreditsManagerPolygon` funded with MANA by converting the USDC that
backs buyer credits, and it reconciles the books.

It does **not** re-implement marketplace or credits logic — settlement reuses the audited
`CreditsManagerPolygon` (custodies MANA, calls the offchain marketplace's `accept([trade])`),
and user crediting lives in `credits-server`. See `../VISION.md` and
`../design/SHOP_SERVER_SPEC.md` for the full model.

## What it does

1. **Custody signer** (`src/adapters/signer`) — a `TreasurySigner` abstraction with a
   production **AWS KMS** implementation (secp256k1, key never leaves KMS) and a guarded
   **dev** implementation (local key, Amoy only). No raw seeds/keys in the service.
2. **Swap** (`src/logic/treasury/swap`) — USDC → MANA on Polygon. Production uses a DEX
   aggregator (0x-style) with an oracle-derived slippage floor; Amoy uses a **mock** that
   fills at the mock oracle rate (no testnet DEX liquidity). Config picks the impl.
3. **Refill** (`src/logic/treasury/refill`) — reads the CreditsManager MANA balance and,
   when below threshold, swaps USDC → MANA and transfers it in. Two strategies:
   `working-balance` (default) and `just-in-time`. Runs as a lifecycle-managed timer worker.
4. **Reconcile / ledger** (`src/logic/treasury/reconcile`) — an append-only Postgres ledger
   of USDC-in / MANA-out / retained fees, plus drift detection between expected and actual
   balances.
5. **HTTP** (`src/controllers`) — minimal internal/admin surface: `/status`,
   `/treasury/status`, and `POST /treasury/deposits` to record a USDC inflow.

Built on `@well-known-components`, modelled on `credits-server`. Chain access uses **ethers v5**.

## Quick start (Amoy)

```bash
yarn install
docker compose up -d            # local Postgres on :5460
cp .env.default .env            # Amoy defaults; edit DEV_TREASURY_PRIVATE_KEY for a funded test key
yarn build
yarn start
```

Defaults target **Amoy testnet (80002)**: `SWAP_MODE=mock`, `SIGNER_MODE=dev`
(guarded by `ALLOW_DEV_SIGNER=true` + `NODE_ENV!=production`), and the Amoy contract
addresses are baked in (`src/logic/config/chains.ts`), so most env vars are optional.

## Tests

```bash
yarn test          # jest + coverage
yarn typecheck     # tsc --noEmit for src and test
```

The swap math, refill threshold logic, reconciliation drift detection, signer selection,
and the full purchase → refill → reconcile loop are covered by unit + integration tests
with a mocked chain provider (no network, no real DB required).

## Endpoints

| Method | Path                  | Auth              | Purpose                                            |
| ------ | --------------------- | ----------------- | -------------------------------------------------- |
| GET    | `/status`             | none              | Liveness/version                                   |
| GET    | `/treasury/status`    | `API_ADMIN_TOKEN` | Balances, ledger summary, reconciliation report    |
| POST   | `/treasury/deposits`  | `API_ADMIN_TOKEN` | Record a USDC inflow (idempotent on `reference`)   |

## Configuration

See `.env.default` (Amoy dev) and `.env.example` (production shape, all fake placeholders).
Key knobs: `SIGNER_MODE`, `SWAP_MODE`, `REFILL_STRATEGY`, `REFILL_TARGET_MANA`,
`REFILL_THRESHOLD_MANA`, `SWAP_SLIPPAGE_BPS`, `SWAP_ORACLE_SPREAD_BUFFER_BPS`.

## Production readiness

Before mainnet: provision the KMS key + IAM and wire a real `KmsSignerFactory`; point
`SWAP_MODE=dex` at a funded aggregator; set all mainnet addresses; add monitoring/alerts on
the treasury metrics. See the "What still needs real infra" section of the design spec.

> Internal blockchain terminology is fine in this service. Any user-facing strings must stay
> web2-friendly per `../CONVENTIONS.md` — but this backend has none.
