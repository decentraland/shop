# shop-server — Treasury Service Design Spec

> The treasury/settlement backend for the Shop. Keeps the audited `CreditsManagerPolygon`
> funded with MANA by converting the USDC that backs buyer credits, and reconciles the books.
> **Scope:** treasury only. It does **not** re-implement marketplace or credits logic.
>
> Companion docs: `../VISION.md` (economic model), `../ROADMAP.md` (Phase 3 = settlement),
> `../server/README.md` (run/ops). Code: `../server`.

---

## 1. Where it sits

```
        card ──► Stripe (Bridge inside) ──► USDC ──────────────┐
                                                               ▼
 buyer ──► Shop frontend ──► credits-server (USD ledger)   shop-server (THIS)  ── treasury
                    │                    ▲                      │  - custody signer (KMS)
                    │  buy credits       │ record inflow        │  - USDC ─► MANA swap
                    ▼                    │                      │  - refill CreditsManager
              spend credits ────────────┴──────────────────►   │  - reconcile ledger
                                                               ▼
                             CreditsManagerPolygon (audited) ──► accept([trade]) ──► NFT to buyer
                                (custodies MANA, pays creator + fee)
```

- **credits-server** owns the buyer's USD credit balance and the per-purchase `Credit`
  signature. **Unchanged by this service.**
- **shop-server** owns the *money underneath*: it holds the USDC backing, swaps it to MANA,
  and keeps the `CreditsManager` topped up so purchases settle instantly. It records every
  flow and reconciles treasury USDC / CreditsManager MANA against the ledger.
- **No new on-chain code.** Settlement is the existing audited `CreditsManagerPolygon`.

This realises VISION.md **D2** (settle in MANA via the audited contract) and **D4** (async
refill of a small MANA working balance, off the buy path).

---

## 2. Module boundaries

Modelled on `credits-server` (WKC: `@well-known-components/*`, factory components,
`Pick<AppComponents, ...>` DI, pg-component migrations, prom metrics). Everything depends on
**interfaces** (`src/types/components.ts`); concrete impls are chosen inside factories from
config, so swapping KMS↔dev or DEX↔mock never touches business logic.

| Module | Path | Responsibility |
| --- | --- | --- |
| **Treasury config** | `logic/config` | Resolve env + per-chain defaults into an immutable `TreasuryConfig`; enforce boot-time safety invariants (dev-signer guard, threshold sanity, DEX url). |
| **Chain reader** | `adapters/chain` | Read ERC-20 balances + the MANA/USD oracle behind `IChainReaderComponent`; validate the oracle answer (positive, fresh). |
| **Custody signer** | `adapters/signer` | `ITreasurySignerComponent` = `getAddress` + `sendTransaction`. KMS impl (prod) / dev impl (guarded) selected by a factory. |
| **Swapper** | `logic/treasury/swap` | `swapUsdcForMana(usdc) → SwapResult`. DEX aggregator impl (prod) / oracle-rate mock (Amoy). Slippage floor enforced in both. |
| **Refill** | `logic/treasury/refill` | Decide + execute funding: `computeRefillPlan` (pure) → swap → transfer → record. `working-balance` / `just-in-time`. Runs as a lifecycle timer worker (`job.ts`). |
| **Reconcile / ledger** | `logic/treasury/reconcile` + `adapters/db` | Append-only Postgres ledger of every flow; `computeDrift` (pure) flags expected-vs-actual divergence. |
| **HTTP** | `controllers` | `/status`, `/treasury/status`, `POST /treasury/deposits` (bearer-token, schema-validated). |
| **Math** | `logic/treasury/math` | Integer-only oracle conversion, slippage floor, buffer, unit scaling. No floats in the money path. |

**Pure vs effectful split.** The three decision-critical pieces are extracted as pure
functions with no I/O so every branch is exhaustively unit-testable:
`math.ts` (conversion/slippage/buffer), `refill/plan.ts` (threshold decision),
`reconcile/drift.ts` (drift). The components wrap these with chain/db effects.

---

## 3. The custody decision — KMS, never a raw key

**Decision: production custody is AWS KMS (asymmetric secp256k1). A raw private key never
exists in the service in production.**

Rationale (VISION.md §7 "never a raw seed in the backend"): the treasury signer moves real
value (USDC → MANA, then MANA into the CreditsManager). A plaintext key in env/memory is the
single worst failure mode. KMS/MPC/HSM keeps the key material in a hardware boundary; the
service holds only a **key id** and asks KMS to sign digests remotely.

Design:

- `ITreasurySignerComponent` is a 2-method interface (`getAddress`, `sendTransaction`) — the
  minimum the treasury needs. Nothing downstream knows how signatures are produced.
- **KMS impl** (`kms-signer.ts`) takes an injected `KmsSignerFactory` that returns an
  ethers-v5 `Signer` bound to a KMS key (a thin wrapper over a lib like
  `@rumblefishdev/eth-signer-kms` or `aws-kms-ethers-signer`). This keeps the heavy AWS SDK
  out of the module/test path and makes the real KMS call the *only* thing to wire for prod.
  Without a factory it **refuses to boot** — it never silently falls back to a local key.
- **Dev impl** (`dev-signer.ts`) loads a local key from `DEV_TREASURY_PRIVATE_KEY` for Amoy
  testing only. It is **doubly guarded**: the config component refuses `SIGNER_MODE=dev`
  unless `NODE_ENV!=production` **and** `ALLOW_DEV_SIGNER=true`, and the signer factory
  re-asserts the same invariant so wiring can't bypass it. Logs mask the key id; the key is
  never logged.

Alternatives considered: Fireblocks / Turnkey (MPC). Equally acceptable — the interface is
custody-agnostic; only the factory changes. KMS chosen as the default because it is the
lowest-friction managed option that satisfies "no plaintext key".

---

## 4. The refill strategy + math

### Strategy (config: `REFILL_STRATEGY`)

- **`working-balance` (default, VISION.md D4).** Keep a modest MANA buffer in the
  CreditsManager. When balance < `REFILL_THRESHOLD_MANA`, top up to `REFILL_TARGET_MANA`.
  Result: **1 on-chain step per purchase** (fast UX), at the cost of a *small, bounded*
  price-risk on the buffer — kept tiny by sizing the buffer to minutes/hours of volume and
  refilling often (`REFILL_INTERVAL_MS`).
- **`just-in-time`.** Refill only the shortfall against imminent demand — zero standing MANA,
  ~zero price risk, but 2 on-chain steps around a purchase. Supported for completeness;
  atomic JIT (swap + fund + `useCredits` in one tx) would need a new orchestrator contract
  (new audit) and is out of scope.

### The three amounts (VISION.md §3), in code

All money math is **integer-only** (`ethers.BigNumber`) in base units — USDC 6dp, MANA 18dp,
oracle 8dp — to avoid float drift. Human-unit helpers exist only for config/logs.

```
mana = usdc · 10^(18) · 10^(oracleDec) / (10^(6) · price)     // usdcToMana
usdc = mana · price · 10^(6) / (10^(18) · 10^(oracleDec))     // manaToUsdc (inverse)
floor(x, bps)  = x · (10000 − bps) / 10000                    // slippage guard (amountOutMin)
buffer(x, bps) = x · (10000 + bps) / 10000                    // over-buy for oracle/DEX spread
```

Integer division truncates *toward the safe direction*: `usdcToMana` never over-quotes MANA.

### Plan decision (`computeRefillPlan`, pure)

Working-balance:
- `balance ≥ threshold` → **no-op** (threshold inclusive).
- else shortfall = `target − balance`; if `shortfall < REFILL_MIN_MANA` → **no-op** (dust
  guard, avoids a storm of tiny swaps); else acquire `shortfall` MANA.

Just-in-time: same shape but shortfall = `pendingDemand − balance`, no standing buffer.

`usdcToSpend` is derived from `manaToAcquire` at the oracle price; the component then applies
`SWAP_ORACLE_SPREAD_BUFFER_BPS` to **over-buy USDC** so the fill still reaches target after
the oracle↔DEX spread. The swapper independently enforces `SWAP_SLIPPAGE_BPS` as a floor.

### Execution (`refill/component.ts`, `runOnce`)

1. read CreditsManager MANA balance + oracle price
2. `computeRefillPlan`; if no-op, return cheaply
3. `usdcToSpend = buffer(plan.usdcToSpend, oracleSpreadBufferBps)`
4. `swapper.swapUsdcForMana(usdcToSpend)` (asserts ≥ slippage floor, else throws)
5. `signer.sendTransaction(MANA.transfer(creditsManager, manaReceived))`
6. `reconcile.recordRefill(...)` — one ledger event with the full leg detail

A failure *after* the swap but *before/at* the transfer is surfaced in the outcome +
`treasury_refill_failures_total` and is **not** recorded as a completed refill, so ops can
reconcile stranded MANA instead of the ledger silently over-counting.

---

## 5. Sequence: a purchase → refill

Convert-at-spend with the working-balance buffer (VISION.md §7):

```
Buyer clicks Buy
  │
  ├─(credits-server) validate + deduct USD credit balance
  ├─(credits-server) sign Credit, submit useCredits(credit, accept([...])) via relayer
  │                   → CreditsManager pays creator + fee in MANA, NFT → buyer   [FAST: MANA already in contract]
  │
  └─ ... asynchronously, OFF the buy path ...
        (shop-server refill timer, every REFILL_INTERVAL_MS)
          ├─ read CreditsManager MANA balance
          ├─ balance < threshold?  ── no ─► done (no-op)
          └─ yes ─► over-buy USDC by spread buffer
                    ├─ swap USDC → MANA  (DEX in prod / mock on Amoy)
                    ├─ transfer MANA → CreditsManager
                    └─ record refill in ledger
```

The buyer's purchase spends MANA that is **already** in the contract → one tx, no wait. The
treasury refills the buffer separately. Earlier, the payments flow recorded the USDC inflow:

```
Stripe settles USDC ─► POST /treasury/deposits { usdcAmount, reference }
                        └─ ledger: +usdc, 0 mana   (idempotent on reference)
```

---

## 6. Reconciliation invariants

The ledger is append-only; every row is a signed `(usdcDelta, manaDelta)` from the treasury's
POV, stored as `NUMERIC(78,0)` (exact uint256 base units, no float).

| Entry | usdcDelta | manaDelta | note |
| --- | --- | --- | --- |
| `usdc_deposit` | +usdc | 0 | pack purchase inflow; idempotent on `reference` |
| `refill` | −usdc | +mana | USDC spent, MANA transferred into CreditsManager |
| `fee_retained` | 0 | +mana | fee kept in MANA (VISION.md §5) |

Derived expectations:
- `expectedTreasuryUsdc = Σ deposits − Σ refill USDC`
- `expectedCreditsManagerMana = Σ refill MANA transferred in`

Invariants checked by `reconcile()` (drift in bps, default tolerance **200 bps = 2%**,
covered by the fee margin + spread buffer):
- **I1 — Treasury USDC:** on-chain USDC of the treasury address ≈ `expectedTreasuryUsdc`.
  Drift here means untracked inflow/outflow (missed deposit record, unexpected transfer).
- **I2 — CreditsManager MANA:** on-chain MANA of the CreditsManager ≈
  `expectedCreditsManagerMana` (modulo the pre-existing baseline and settlement consumption,
  which the tolerance absorbs; per-sale consumption is tracked in credits-server, not here).
- **I3 — Idempotency:** replaying a deposit `reference` never double-counts (partial unique
  index on `(type, reference)`), so a retried Stripe webhook is safe.

Drift edge cases are explicit (`computeDrift`): `expected=0 ∧ actual=0` → 0 bps healthy;
`expected=0 ∧ actual>0` → flagged (unexplained funds are themselves a signal, not a divide-by-zero).

Metrics: `treasury_reconciliation_drift_bps{account}`, `treasury_reconciliation_healthy`,
`treasury_credits_manager_mana_balance`, `treasury_refills_total`, `treasury_*_spent/acquired`.

---

## 7. Chain config (Amoy 80002, the test target)

Baked-in defaults (`logic/config/chains.ts`), overridable per-key by env; production chains
must supply every address via env (no defaults for 137).

| Contract | Amoy address |
| --- | --- |
| MANA | `0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0` |
| USDC (Circle) | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| MANA/USD mock oracle (8dp, ~$0.2696) | `0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e` |
| CreditsManagerPolygon | `0x8052a560e6e6ac86eeb7e711a4497f639b322fb3` |
| Offchain Marketplace V4 | `0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7` |

Amoy has **no USDC/MANA DEX liquidity**, so `SWAP_MODE=mock` fills at the oracle rate (still
running the full slippage-guard path). Everything else — reading the oracle, reading the
CreditsManager balance, transferring MANA — works on Amoy for real.

---

## 8. What still needs real infra before prod

1. **KMS key + wiring.** Provision an asymmetric KMS key (`ECC_SECG_P256K1`, `SIGN_VERIFY`),
   grant the service IAM `kms:Sign` + `kms:GetPublicKey` on that key only, and pass a real
   `KmsSignerFactory` in `components.ts`. Everything else is already KMS-agnostic.
2. **Mainnet DEX swap.** Set `SWAP_MODE=dex` + `DEX_AGGREGATOR_URL` (0x/1inch), finish the
   two marked prod steps in `dex-swapper.ts` (ERC-20 approve of `allowanceTarget`; read the
   *actual* filled MANA from the receipt/balance delta and re-assert ≥ floor), and fund the
   treasury with USDC. Tune `SWAP_SLIPPAGE_BPS` / spread buffer to real liquidity.
3. **Mainnet addresses.** Provide all five contract addresses via env for chain 137.
4. **Payments integration.** Wire Stripe (Bridge inside) to call `POST /treasury/deposits`
   on USDC settlement; secure the internal endpoints beyond the shared bearer token (mTLS /
   private networking).
5. **Monitoring + alerts.** Alert on `treasury_reconciliation_healthy=0`, refill failures,
   CreditsManager MANA below threshold for too long, and oracle staleness. Runbook for
   stranded-MANA (swap succeeded, transfer failed) reconciliation.
6. **Chargeback exposure (VISION.md risks).** Card is reversible, settlement is not — pair
   with Stripe Radar / per-account limits upstream; the treasury records inflows but does not
   itself gate fraud.
7. **DB in prod.** Provision Postgres; migrations run on boot via pg-component.

---

## 9. Test coverage (the core)

`yarn test` → **106 tests, 16 suites, all passing** (jest + ts-jest, mocked chain provider,
no network/live DB). Emphasis on the money-critical logic:

- **swap math** — oracle conversion (exact base-unit values hand-verified at $1 and $0.2696),
  slippage floor, buffer, round-trip, invalid price/amount guards.
- **refill threshold** — below / above / exactly-at-threshold / zero / dust-floor edges, for
  both `working-balance` and `just-in-time`.
- **reconciliation drift** — within/at/over tolerance, surplus, zero-vs-zero, zero-vs-nonzero,
  18dp precision.
- **signer selection** — dev allowed only when guarded; refused in prod / without the flag;
  KMS refuses to boot without a factory; KMS works with one.
- **swapper selection + impls** — mock fills at oracle & enforces the floor; DEX quotes,
  broadcasts, and rejects sub-floor quotes / failed requests.
- **refill component** — plan→swap→transfer→record; swap failure and post-swap transfer
  failure paths; transfer calldata correctness.
- **chain reader** — ABI-decodes balances; rejects non-positive / stale oracle rounds.
- **ledger adapter** — insert, idempotent conflict, summary derivation, recent entries.
- **HTTP handlers** — deposit 201/200(idempotent)/500; treasury status 200/503.
- **integration** — full purchase → deposit → refill → reconcile loop (real swap+refill+
  reconcile + in-memory ledger), incl. a drift-flagging scenario.
