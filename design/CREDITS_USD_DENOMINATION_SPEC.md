# Credits USD Denomination — Design Spec

> **Status:** research spike / proposal. Nothing here is applied. This document is the deliverable of a read-only investigation of `credits-server`, `credits-squid-core`, and `credits-pipes`, cross-checked against `shop/VISION.md`.
>
> **Goal:** make new Shop credits **fixed-USD-denominated** (`1 credit = $0.10`, so a $2 item always costs 20 credits) while (a) settlement stays in **MANA** on the unchanged `CreditsManagerPolygon` contract, and (b) legacy **MANA-pegged** credits keep working untouched (no destructive migration, no lost balances).
>
> **Scope of code writes:** none. This markdown file is the only artifact.

---

## 0. TL;DR

- **Recommended model:** extend `credits-server` to be a **dual-denomination ledger**. Add a `denomination` discriminator column to `user_credits` (`MANA` = legacy, `USD` = new) plus a `usd_cents` amount column for USD credits. The user's **USD balance is the source of truth**; the on-chain `Credit.value` (MANA wei) is a **per-purchase spend cap** computed from the item's USD price at the marketplace oracle rate with a short-TTL buffer. The USD debit equals the item's USD price and is stable regardless of MANA; the MANA the contract actually settles is variable, but the oracle cancels out.
- **Does `credits-server` change?** Yes — it is the ledger of record and already holds the signing key and the IAP "pay-money-for-credits" infra. Headline change set: 1 additive migration (discriminator + USD amount + purchase-intent ledger), a new per-purchase signing path (USD→MANA at oracle with TTL/buffer), an extended `GET /users/:address/credits` response (denomination + USD amount + credits count), and a consumption-reconciliation path that debits the USD ledger by the item's USD price rather than by the MANA `_value` the squid reports.
- **Can legacy MANA credits and USD credits coexist?** **Yes, feasibly, additively.** The discriminator defaults to `MANA`, so every existing row keeps its exact semantics with no rewrite. The consumption pipeline (squid `credit_consumption.amount` in MANA wei, joined by `credit_id = salt`) keeps working for MANA credits verbatim; USD credits get a parallel reconciliation that translates on-chain MANA consumption into a USD debit. Rollout is guarded by a feature flag and is reversible.

---

## 1. Current-state map — the credit lifecycle today

### 1.1 Data model (DB tables & columns)

**`user_credits`** — the ledger of record. Created in `credits-server/src/migrations/1739469757131_init.ts:53-64`, extended over time:

| Column | Type | Meaning | Source migration |
| --- | --- | --- | --- |
| `id` | `varchar(66)` PK | The **salt** = `keccak256(utf8(uuid))`. This is the on-chain credit id. | `1739469757131_init.ts:54-57` |
| `user_address` | `varchar(42)` | Recipient wallet (lowercased on insert). | init |
| `amount` | `numeric` | **MANA wei** granted (18 decimals). | init:59 |
| `contract` | `varchar(42)` | CreditsManager address the credit was signed against. | init:60 |
| `timestamp` | `bigint` | Creation time (ms). | init:61 |
| `signature` | `text` | Backend ECDSA signature over the credit struct. | init:62 |
| `season_id` | `integer` NULL | Season, NULL for on-demand/IAP. | init:63 |
| `goal_id` | `text` NULL | Goal, nullable since IAP. | `1778752672528_iap-credits.ts:40` |
| `week_id` | `integer` NULL | Week, nullable since IAP. | `1778752672528_iap-credits.ts:41` |
| `expires_at` | `bigint` | Unix seconds; season end + grace, or `NEVER_EXPIRES_AT` for IAP. | `1747150767217_credit-add-expires-at.ts` |
| `claimed_at` | `bigint` NULL | When claimed; IAP is pre-claimed. | (later migration) |
| `credit_source` | `text` NOT NULL default `'goal'` | `goal` \| `on_demand` \| `iap`. **The existing precedent for a discriminator.** | `1778752672528_iap-credits.ts:10-33` |

Satellite tables extend a `user_credits` row 1:1 by `credit_id` FK:
- **`on_demand_credits`** — `granter_address`, `reason`, `annotation`.
- **`iap_credits`** — Apple metadata + refund bookkeeping (`1778752672528_iap-credits.ts:72-112`): `apple_transaction_id` (unique, idempotency key), `apple_product_id`, `refunded_at`, `refund_id`, `refund_reason`, `consumed_at_refund_wei`. FK relaxed to `ON DELETE SET NULL` so the row survives refunds (`1778752900000_iap-credits-survive-refund.ts:7-28`).
- **`iap_account_tokens`** — `app_account_token` (UUID) → `wallet` map (`1778752700000_iap-account-tokens.ts`).
- **`rollbacked_credits`** — archive for refunded/rolled-back credits.

Entity typings live in `credits-server/src/types/entities.ts` — `UserCredits` (`:120-146`), `CreateCredit` (`:148-161`), `CreditSource` enum (`:60-64`), `CreditStatus` enum (`:14-19`), `NEVER_EXPIRES_AT = 4070908800` (`:72`).

**Everything is MANA-wei-denominated.** There is no USD field anywhere. `iap-quote.ts:11` states it explicitly: *"All amounts are in wei to match how user_credits stores them."*

### 1.2 Create → Sign

The single signing path is `createSignedCredit()` in `credits-server/src/logic/credits-granter.ts:52-142`; `grantIapCredits()` (`:337-415`) is its IAP-flavored sibling. Flow:

1. **Amount source (MANA, ether units):** goal → `goal.reward` (`credits-granter.ts:179`); on-demand → admin-passed `amount`; IAP → `iapProductCatalog.getAmountForProduct(productId)` (`iap-mint.ts:74`). **All fixed numbers; there is no oracle/price feed anywhere in `credits-server`.**
2. **Convert to wei:** `const amountInWei = ethers.parseEther(amountInEther.toString())` (`credits-granter.ts:63`). Stored in `user_credits.amount`.
3. **Salt / id:** `creditId = randomUUID()`; `saltBytes32 = keccak256(toUtf8Bytes(creditId))` (`credits-granter.ts:81,101`). `user_credits.id = saltBytes32`.
4. **Expiry:** season end + `CREDITS_GRACE_PERIOD_DAYS` (default 14) for goals; `now + CREDITS_NO_SEASON_EXPIRATION_DAYS` (default 90) for no-season; `NEVER_EXPIRES_AT` for IAP (`credits-granter.ts:68-78`, `:358-364`).
5. **Contract:** `getContract(ContractName.CreditsManager, CHAIN_ID)` (or `CREDITS_MANAGER_ADDRESS_OVERRIDE`) (`credits-granter.ts:94-100`).
6. **Sign** (`credits-server/src/logic/signer.ts:46-88`) — this is the exact struct the contract verifies:
   ```ts
   const credit = {
     value: ethers.parseUnits(creditGrant.value.toString(), 'ether'), // MANA wei
     expiresAt: BigInt(creditGrant.expiresAt),
     salt: creditGrant.salt
   }
   const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
     ['address', 'uint256', 'address', 'tuple(uint256 value, uint256 expiresAt, bytes32 salt)'],
     [ userAddress.toLowerCase(), BigInt(CHAIN_ID), contract.toLowerCase(),
       [credit.value, credit.expiresAt, credit.salt] ]
   )
   const messageHash = ethers.keccak256(encodedData)
   const flatSig = await new ethers.Wallet(PRIVATE_KEY_HEX).signMessage(ethers.getBytes(messageHash))
   ```
   Signer key = `PRIVATE_KEY` env (`signer.ts:18`). The signature is written once and **never recomputed** — it is immutable for the life of the credit.

> **Contract-level fact that makes the whole USD model possible.** On-chain, `Credit.value` is a **spend cap**, not a fixed debit. `useCredits` (squid ABI `credits-squid-core/src/abi/credits.ts:73`) takes:
> ```
> useCredits(( Credit[] credits, bytes[] creditsSignatures,
>              ExternalCall externalCall, bytes customExternalCallSignature,
>              uint256 maxUncreditedValue, uint256 maxCreditedValue ))
> ```
> The contract runs the underlying trade (which, for `ASSET_TYPE_USD_PEGGED_MANA` items, prices the item in USD and settles the *actual* MANA at the marketplace's Chainlink MANA/USD oracle), then applies credits up to each credit's `value`. It emits `CreditUsed(_sender, _creditId, _credit, _value)` where `_value` is the **MANA actually consumed** (`credits-squid-core/src/abi/credits.ts:7`). So a single credit whose `value` is a generous MANA cap can back a purchase whose real MANA cost floats — exactly what a USD-denominated credit needs.

### 1.3 Serve

Route: `GET /users/:address/credits` → `getUserCreditsHandler` (`routes.ts:65`, handler `controllers/handlers/get-user-credits.ts:6-81`). Auth is signed-fetch and address must match the signer. Response:
```jsonc
{
  "credits": UserCredits[],          // per-credit rows
  "totalCredits": number,            // Σ availableAmount (MANA wei) across all credits
  "totals": {
    "expiring": number,              // Σ of GOAL + ON_DEMAND availableAmount (MANA wei)
    "nonExpiring": number            // Σ of IAP availableAmount (MANA wei)
  }
}
```
Each `UserCredits` row (`types/entities.ts:120-146`, built by the SQL in `adapters/db/db.ts:167-233`) carries: `id`, `userAddress`, `amount` (wei), `availableAmount` (wei), `status` (`AVAILABLE|PARTIALLY_USED|FULLY_USED|EXPIRED`), `contract`, `timestamp`, `signature`, `seasonId`, `goalId`, `weekId`, `claimedAt`, `expiresAt`, `creditSource`. **Every amount is MANA wei.** The shop app consumes this.

### 1.4 Consume → Decrement

Consumption is **not** written by `credits-server`. It is reconciled from an indexer:

1. On-chain `CreditUsed(_sender, _creditId, _credit, _value)` fires per credit spent.
2. `credits-squid-core` decodes it (`src/main.ts` ~`:589-648`) and writes a `CreditConsumption` entity (`schema.graphql:3-14`): `creditId = _credit.salt`, `amount = _value` (MANA wei), `beneficiary = _sender`, plus `contract`, `timestamp`, `block`, `txHash`, `orderHash`.
3. `credits-pipes` materializes this into Postgres table **`squid_credits.credit_consumption`** (`credits-pipes/migrations/0000_light_aaron_stack.sql:22-32`): `credit_id`, `contract`, `amount` (`numeric(78,0)` MANA wei), `beneficiary_id`, `timestamp`, `block`, `tx_hash`, `order_hash`.
4. `credits-server` reads that table cross-schema. `getUserCredits`/`getUserCreditsAmount` (`adapters/db/db.ts:131-233`) compute availability by **joining `user_credits.id = credit_consumption.credit_id`** (i.e. salt) and subtracting:
   ```sql
   WITH credit_totals AS (
     SELECT credit_id, SUM(amount) AS total_consumed
     FROM squid_credits.credit_consumption
     WHERE beneficiary_id = $addr GROUP BY credit_id )
   ...
   CASE WHEN ct.total_consumed IS NULL THEN uc.amount
        ELSE GREATEST(uc.amount - ct.total_consumed, 0) END AS "availableAmount"
   ```
   Status is derived the same way (`db.ts:196-201`). **This subtraction is the load-bearing MANA assumption:** `amount` (MANA wei) − `total_consumed` (MANA wei). It is only meaningful when both sides are the same unit.

### 1.5 How the IAP flow prices/mints today

The IAP flow is the closest existing "pay money → get credit" path. Lifecycle:
`POST /credits/iap/quote` (gate + register appAccountToken) → `POST /credits/iap/register` (idempotent map) → `POST /credits/iap/verify` (device posts Apple JWS) **or** `POST /apple/webhook` (Apple posts JWS) → mint → `POST /credits/iap/refund` / REFUND webhook.

- **Pricing = fixed catalog, no oracle.** `iap-product-catalog.ts:32-64` reads env `IAP_PRODUCT_CATALOG`, a JSON map `productId → MANA amount (ether units)`, e.g. `{"com.decentraland.credits.pack_50": 50}`. Mint resolves `amount = getAmountForProduct(productId)` (`iap-mint.ts:74`) and grants that many MANA. **Apple's USD price is never converted; the MANA number is baked into the product mapping.** This is precisely the MANA-pegging the Shop wants to replace.
- **Mint** reuses the exact goal signer path (`grantIapCredits` → `createSignedCredit` semantics), with `value = amount`, `expiresAt = NEVER_EXPIRES_AT`, `creditSource = IAP`, `claimed_at = now`, and inserts `user_credits` + `iap_credits` in one tx (`credits-granter.ts:337-415`).
- **Refund is consumption-aware, no clawback** (`iap-refund.ts:48-128`): compute `consumed = amount − availableAmount`; if `remaining > 0` revoke on-chain, else skip (fully spent → "we eat the loss"); persist `consumed_at_refund_wei`; move row to `rollbacked_credits`; keep the `iap_credits` row (FK SET NULL) to block JWS replay.

---

## 2. Where the USD denomination lives

### 2.1 The core reframing

A MANA-pegged credit and a USD-pegged credit differ in **which number is the invariant**:

| | Legacy (MANA) | New (USD) |
| --- | --- | --- |
| Source of truth | `amount` (MANA wei) | `usd_cents` (USD) |
| On-chain `Credit.value` | the debit (spend it to zero in MANA) | a **per-purchase MANA cap** derived from the item's USD price at oracle rate |
| What the buyer sees | drifts vs USD | fixed: `credits = usd_cents / 10` |
| Balance decremented by | MANA consumed (from squid) | the **item's USD price** (fixed), reconciled from the on-chain spend |

The MANA number stops being the balance and becomes a *cap that authorizes a settlement*. The USD number becomes the ledger.

### 2.2 Option (a) — extend `credits-server` with a USD ledger  ✅ RECOMMENDED

**Reasons, grounded in the code:**
1. `credits-server` is already the **ledger of record** — it owns `user_credits`, the availability computation (`db.ts:131-233`), and the serving endpoint the shop consumes (`get-user-credits.ts`). A second ledger would have to be reconciled against this one anyway.
2. It already holds the **credit-signing key** (`PRIVATE_KEY`, `signer.ts:18`) and the exact struct-signing logic (`signer.ts:46-88`). Per-purchase USD→MANA signing is a small variation on code that only exists here. `shop/VISION.md:123` confirms: *"Credits signer — signs the per-purchase authorization (`Credit`). Already exists in credits-server."*
3. It already has a **discriminator precedent** (`credit_source`, added additively in `1778752672528_iap-credits.ts`) and **money-in infra** (IAP quote/mint/refund, caps, idempotency, Apple webhook) that a USD "buy credits with a card" flow is a near-clone of. `shop/VISION.md:221,248` explicitly plans to *"extend … credits-server (USD ledger + per-purchase signing)."*
4. Backward-compat is cheapest here: the same table, same serving endpoint, one nullable discriminator — legacy rows are literally untouched.

### 2.3 Option (b) — a separate USD ledger layer (e.g. inside the new `shop-server`)

A new service holds USD balances; `credits-server` stays MANA-only and just mints per-purchase MANA caps on request. **Rejected as the primary home** because it duplicates the ledger and forces a two-system reconciliation (USD balance in shop-server vs consumption truth derived from squid via credits-server), doubling the places a balance can be wrong. It also splits the signing key's natural owner from the balance's owner.

> **Nuance — the `shop-server`/treasury still exists, but for a different job.** `shop/VISION.md:126-144, §6, §7` puts the **money movement** (Stripe card → USDC custody → USDC→MANA swap → fund the CreditsManager working balance) in a new treasury/payments service. That is orthogonal to *where the USD balance lives*. **Recommendation:** USD **balance ledger** lives in `credits-server` (this spec); **USD custody + swap + contract funding** lives in `shop-server`. `credits-server` decrements/credits the ledger and signs the per-purchase cap; `shop-server` guarantees the contract has MANA to settle it.

### 2.4 The per-purchase signing change (the heart of it)

Today signing is at **grant** time with a fixed MANA `value` (`credits-granter.ts:104-113`). For USD credits, the on-chain `value` cannot be fixed at grant time (MANA price is unknown until the buyer actually purchases an item). So USD credits need **signing at spend time**:

- **Grant time (USD credit purchased):** write a `user_credits` row with `denomination = 'USD'`, `usd_cents = pack value`, `amount = NULL` (or 0), **no signature yet** (or a sentinel). The USD balance now exists. There is no on-chain object yet — that's fine, nothing settles until the buyer buys an item.
- **Spend time (buyer clicks "buy" on a $2 item):** a new endpoint (e.g. `POST /users/:address/credits/authorize-purchase`) takes the item's USD price + a fresh oracle quote, computes a MANA cap `value = ceil(usd_price / mana_usd_rate) × (1 + buffer)`, mints an ephemeral on-chain `Credit` (salt, `expiresAt = now + TTL`, `value = cap`), signs it with the existing signer, and returns it to the caller to submit via `useCredits`. The USD debit is recorded as a **pending purchase intent** for the item's USD price.

This is the "off-chain USD ledger + per-purchase MANA cap at oracle with short TTL" model from the brief, and it is compatible with `useCredits`'s cap semantics (§1.2) and with VISION's convert-at-spend funding (`VISION.md:126-144`).

---

## 3. File-by-file change set (proposed, NOT applied)

> All changes are additive. No existing column is dropped or repurposed. Legacy rows are never rewritten.

### 3.1 Migration — `credits-server/src/migrations/<ts>_usd-credits.ts` (NEW)

```
-- 1. Denomination discriminator (default preserves legacy semantics)
ALTER TABLE user_credits ADD COLUMN denomination text NOT NULL DEFAULT 'MANA';
CREATE INDEX idx_user_credits_denomination ON user_credits(denomination);
-- existing rows implicitly become 'MANA' — NO backfill needed, NO rewrite.

-- 2. USD amount for USD credits (integer cents to avoid float drift). NULL for MANA credits.
ALTER TABLE user_credits ADD COLUMN usd_cents bigint NULL;

-- 3. Relax amount so USD credits (whose MANA cap is only known at spend time) can defer it.
ALTER TABLE user_credits ALTER COLUMN amount DROP NOT NULL;   -- was NOT NULL
ALTER TABLE user_credits ALTER COLUMN signature DROP NOT NULL; -- signed per-purchase, not at grant

-- 4. Per-purchase USD ledger: intents + settled debits (the USD "consumption" side).
CREATE TABLE usd_purchase_intents (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_address  varchar(42) NOT NULL,
  salt          varchar(66) NOT NULL,      -- on-chain credit id of the ephemeral cap
  usd_cents     bigint NOT NULL,           -- the item's USD price = what we debit
  mana_cap_wei  numeric NOT NULL,          -- Credit.value we signed
  oracle_rate   numeric NOT NULL,          -- MANA/USD used (audit)
  oracle_at     bigint NOT NULL,           -- oracle timestamp (staleness audit)
  expires_at    bigint NOT NULL,           -- short TTL on the signed cap
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING|SETTLED|EXPIRED|FAILED
  tx_hash       text NULL,                 -- filled on settle
  mana_settled_wei numeric NULL,           -- CreditUsed._value once reconciled
  created_at    bigint NOT NULL,
  settled_at    bigint NULL
);
CREATE INDEX idx_usd_intents_user ON usd_purchase_intents(user_address);
CREATE UNIQUE INDEX idx_usd_intents_salt ON usd_purchase_intents(salt);
```
*Down migration:* drop the table, drop the columns, restore NOT NULL (safe only because USD credits are gated by flag and can be drained/disabled first — see §4).

### 3.2 Types — `credits-server/src/types/entities.ts`

- Add `enum CreditDenomination { MANA = 'MANA', USD = 'USD' }`.
- Add to `UserCredits`: `denomination: CreditDenomination`, `usdCents: number | null`, and a derived `credits?: number` (`usdCents / 10`). Make `amount?`/`signature?` optional on USD rows.
- Add `UsdPurchaseIntent` type mirroring the table.
- `CreditGrantPayload` (`:109-115`) is unchanged (still `{userAddress, value, expiresAt, salt, contract}`) — the per-purchase signer reuses it verbatim.

### 3.3 Signing / creation — `credits-server/src/logic/credits-granter.ts` + a new module

- **Grant USD credit** (new fn, e.g. `grantUsdCredits`): insert `user_credits` with `denomination='USD'`, `usd_cents`, `amount=NULL`, `signature=NULL`, `expiresAt` per policy, `creditSource` = a new `'shop'`/`'usd_pack'` value (or reuse `IAP` semantics for card packs). No signing here.
- **Authorize purchase** (new module `logic/usd-purchase/authorize.ts`): input `{userAddress, itemUsdCents, oracleQuote}`. Steps:
  1. Check USD balance ≥ `itemUsdCents` (available USD, see §3.5).
  2. Compute `manaCapWei = ceil( (itemUsdCents/100) / manaUsdRate ) * (1 + BUFFER_BPS)` — the cap must slightly exceed the expected MANA so oracle drift between sign and spend doesn't underfund the trade. Buffer is unused MANA (the contract only consumes what the trade needs), so it costs nothing when spent.
  3. `salt = keccak256(uuid)`; `expiresAt = now + USD_CAP_TTL_SECONDS` (short, e.g. 120s).
  4. `signer.sign({userAddress, value: manaCapEther, expiresAt, salt, contract})` — **reuses `signer.ts:46-88` unchanged.**
  5. Insert `usd_purchase_intents` row (`status=PENDING`).
  6. Return `{ credit: {value, expiresAt, salt}, signature, intentId }` for the caller to feed into `useCredits`.
- **Oracle adapter** (new `adapters/oracle`): reads the same Chainlink MANA/USD aggregator the marketplace contract uses (decimals 8; Amoy mock ≈ `0.2696`), with a staleness guard. `credits-server` currently has **no** oracle — this is genuinely new (grep for `oracle|chainlink|aggregator` finds nothing in `credits-server/src`).

### 3.4 Serving — `credits-server/src/controllers/handlers/get-user-credits.ts`

Extend the response so the shop gets USD-native numbers while legacy consumers keep MANA:
```jsonc
{
  "credits": [ { ...existing fields..., "denomination": "MANA"|"USD",
                 "usdCents": number|null, "credits": number|null } ],
  "totalCredits": number,          // unchanged: Σ MANA-wei availableAmount (legacy)
  "totals": { "expiring": number, "nonExpiring": number },   // unchanged
  "usd": {                         // NEW block, only meaningful for USD credits
    "availableUsdCents": number,   // Σ usd_cents − Σ settled/pending USD debits
    "availableCredits": number     // availableUsdCents / 10
  }
}
```
The `db.ts` queries gain a `denomination`-aware branch: MANA credits use the existing salt-join subtraction (§1.4) verbatim; USD credits compute `available = usd_cents − Σ(usd_purchase_intents debits for this credit/user)`.

### 3.5 Consumption reconciliation — `credits-server/src/adapters/db/db.ts` + a reconciler

This is the subtle part. The squid reports MANA (`credit_consumption.amount = _value`, MANA wei), but a USD credit must be debited by the **item's USD price**, not by the MANA that happened to settle.

- **MANA credits:** no change. Keep the salt-join subtraction (`db.ts:131-233`). The existing pipeline is untouched.
- **USD credits:** the ephemeral cap's salt is in `usd_purchase_intents`, not (necessarily) a normal `user_credits` balance row. Reconciliation:
  1. A worker matches new `squid_credits.credit_consumption` rows to `usd_purchase_intents.salt`.
  2. On match, mark the intent `SETTLED`, store `mana_settled_wei = _value` and `tx_hash`, set `settled_at`. **The USD debit is `usd_cents` (fixed at authorize time) — the MANA `_value` is recorded for audit only and is NOT what decrements the USD balance.**
  3. Expired/unsettled `PENDING` intents (TTL passed, no on-chain spend) flip to `EXPIRED` and release the reserved USD.
- This means the **USD ledger never subtracts MANA from USD.** The only place MANA→USD arithmetic touches the balance is the *authorize* step, and even there it only sizes the cap, not the debit.

### 3.6 Buy-credits (money-in) — mirror the IAP flow

For card packs, clone the IAP infra (`iap-quote/register/verify/refund`, caps, idempotency) into a USD variant, or drive it from `shop-server`'s Stripe webhook calling a new authenticated `credits-server` endpoint `POST /credits/usd/grant {userAddress, usdCents, paymentRef}` (idempotent on `paymentRef`). The pack maps `$10 → 1000 usd_cents → 100 credits`. No MANA involved at grant.

### 3.7 Squid / pipes — do they change?

**No schema change required.** `credit_consumption` already carries `creditId (=salt)` and `amount (=_value MANA)`, which is all reconciliation needs. Optional, nice-to-have: `MarketplaceCreditUsage.price` (`schema.graphql`) already records the item's MANA price; if the marketplace also emitted the USD-pegged price it would let us cross-check the USD debit against the on-chain intent, but it's not required — the USD price is already known server-side from the authorize step. **Do not** change how the squid stores `amount` (MANA wei); the legacy pipeline depends on it.

---

## 4. Backward-compat + migration plan ("encendido seguro")

### 4.1 Coexistence verdict — feasible

- **Legacy MANA credits are byte-for-byte untouched.** The new `denomination` column defaults to `'MANA'`; no `UPDATE` runs against existing rows. Their `amount`, `signature`, salt-join consumption (§1.4), serving shape (`totalCredits`, `totals`), and IAP refund logic all keep working exactly as today.
- **The discriminator is the same pattern the codebase already used** for `credit_source` (`1778752672528_iap-credits.ts:10-33`), which relaxed NOT NULLs and added a defaulted text column additively without touching prior rows. This is proven-safe in this schema.
- **The mixed response is representable:** each row self-describes via `denomination`; MANA rows expose MANA fields, USD rows expose `usdCents`/`credits`, and the new `usd` aggregate block sits beside the legacy MANA aggregates. Old clients that ignore new fields keep reading `totalCredits` as before.
- **The one true risk** is any consumer that sums `amount`/`availableAmount` across *all* rows assuming MANA — a USD row's `amount` is NULL, so those sums must filter `denomination='MANA'`. The serving endpoint already segments by source (`get-user-credits.ts:60-69`); the USD segmentation is the same shape. The MANA-assumption inventory is in §6.

### 4.2 Feature flag

Add `Feature.USD_CREDITS` to `credits-server/src/features.ts` (which today has `CREDITS_SERVER`, `USER_WALLETS`, `IAP_CREDITS`). Gate: (a) registration of the new USD grant/authorize routes, (b) the `usd` block in the serving response, (c) the reconciler worker. Off = the service behaves exactly as today.

### 4.3 Rollout order

1. **Migration only** (columns + table, flag OFF). Zero behavior change; legacy path unaffected. Verify `denomination='MANA'` on all existing rows and that reads are unchanged.
2. **Deploy code with flag OFF.** Serving response identical (no `usd` block emitted while flag off).
3. **Enable on Amoy** (`VISION.md:252` — mock MANA/USD aggregator + mocked swap live there). Exercise: grant USD pack → authorize $2 purchase → `useCredits` → reconcile → USD balance drops exactly $2. Test with MANA moved to $0.20 and $0.40 to prove USD-debit stability (§5).
4. **Enable for an allow-list of wallets on mainnet**, small pack sizes, low daily caps (reuse the IAP cap infra pattern).
5. **General availability** for Shop wearables/emotes.

### 4.4 Rollback

- **Flag OFF** instantly disables all USD behavior; MANA credits keep working. This is the primary rollback and needs no DB change.
- **Full reversal:** because USD credits are additive and gated, they can be drained (let outstanding USD balances be spent or refunded via the money-in provider) and then the migration's `down` can drop the columns/table. The `amount`/`signature` NOT NULL can be restored only after no USD (NULL-amount) rows remain — so the down migration is safe once USD is fully wound down. Legacy MANA credits are never at risk in any rollback path.

---

## 5. WORKED NUMERIC EXAMPLE

**Setup.** `1 credit = $0.10`. A "$10 pack" = 1000 USD cents = **100 credits**. The MANA/USD oracle is the marketplace's Chainlink aggregator (decimals = 8). We'll use the Amoy mock rate **MANA = $0.2696** (raw feed value `26960000` at 8 decimals). We add a small safety **buffer of 2%** to the signed MANA cap so oracle drift between signing and spending can't underfund the trade (the buffer is never consumed — the contract only spends what the trade costs).

### Step 0 — User buys the $10 pack
- Card charges **$10** → `shop-server` custodies **$10 USDC**.
- `credits-server` writes a USD credit row: `denomination='USD'`, `usd_cents = 1000`, `amount = NULL`, `signature = NULL`.
- **Ledger balance: 1000 cents = 100 credits.** No MANA exists yet. Nothing is on-chain.

### Step 1 — User buys a $2 item (MANA = $0.2696)
- Item USD price = **200 cents = 20 credits**.
- Balance check: 1000 ≥ 200 ✓.
- **Compute the MANA cap** at the oracle rate:
  - Expected MANA for $2 = `2 / 0.2696 = 7.41839...` MANA.
  - Apply 2% buffer: `7.41839 × 1.02 = 7.56676...` → **cap `value ≈ 7.566757 MANA` = `7566757...` wei** (rounded up).
- Mint an ephemeral on-chain `Credit`: `{ value = 7.566757 MANA (wei), expiresAt = now + 120s, salt = keccak256(uuid) }`, sign it (existing signer), record a `usd_purchase_intents` row: `usd_cents = 200`, `mana_cap_wei = 7.566757e18`, `oracle_rate = 0.2696`, `status = PENDING`.
- `shop-server` ensures the CreditsManager holds ≥ ~7.42 MANA (working balance / JIT swap of $2 USDC → MANA), then submits `useCredits(credit, accept([$2 item]))`.
- **On-chain settlement:** the USD-pegged item costs $2; at the oracle the contract needs `2 / 0.2696 = 7.41839 MANA`. It pulls **7.41839 MANA** from its balance (creator + fee), delivers the NFT to the buyer, and emits `CreditUsed(..., _value = 7.41839 MANA)`. The **~0.148 MANA buffer is not touched.**
- **Reconcile:** the squid writes `credit_consumption.amount = 7.41839e18` for this salt. The reconciler matches it to the intent, marks it `SETTLED`, stores `mana_settled_wei = 7.41839e18` (audit only).
- **USD debit = the item's price = 200 cents.** Not the MANA. 
- **New balance: 1000 − 200 = 800 cents = 80 credits.** The user sees "80 credits left." ✓ (dropped by exactly $2 / 20 credits.)

### Step 2 — Prove the USD debit is stable when MANA moves

Same $10 pack, buy the **same $2 item**, but at two different MANA prices:

**Scenario A — MANA falls to $0.20**
- Expected MANA = `2 / 0.20 = 10.0 MANA`. Cap (×1.02) = `10.2 MANA`.
- Contract settles the $2 USD-pegged item at oracle → pulls **10.0 MANA**. `CreditUsed._value = 10.0 MANA`.
- Treasury funded the 10 MANA with the **$2** USDC it took (2 / 0.20 = 10) → no loss.
- **USD debit = 200 cents.** Balance 1000 − 200 = **800 cents = 80 credits.**

**Scenario B — MANA rises to $0.40**
- Expected MANA = `2 / 0.40 = 5.0 MANA`. Cap (×1.02) = `5.1 MANA`.
- Contract settles → pulls **5.0 MANA**. `CreditUsed._value = 5.0 MANA`.
- Treasury funded the 5 MANA with the **$2** USDC (2 / 0.40 = 5) → no loss.
- **USD debit = 200 cents.** Balance 1000 − 200 = **800 cents = 80 credits.**

**The invariant:** across MANA = $0.2696, $0.20, $0.40 the **on-chain MANA moved was 7.42 / 10.0 / 5.0 MANA** (wildly different), yet the **USD debited was always exactly $2 (20 credits)** and the balance always dropped 100 → 80 credits. The oracle appears on both sides — it sizes the MANA we buy *and* the MANA the item costs, at the same instant — so it cancels out. The dollar is the stable unit the buyer experiences; MANA is a pass-through settlement quantity.

> Contrast with a legacy MANA credit: 100 MANA-pegged credits buying the same item would be debited **7.42 / 10.0 / 5.0 MANA** respectively — the buyer's "credits" would buy a different number of items as MANA moves. That is exactly the drift the USD model removes.

---

## 6. Open questions / risks

1. **Legal — custodial, non-refundable USD credits.** Prepaid stored value is regulated (`VISION.md:208, 256`). T&C must state non-refundable / non-cashable (Robux-style), with legal review before launch. The refund path (mirroring `iap-refund.ts`) must decide the "already-spent, no on-chain clawback" policy for USD too.
2. **"Credits" naming collision.** DCL already markets promo "Credits" that are **MANA-pegged and seasonal** (this very service; goals/seasons). New USD credits share the word (`VISION.md:212`). The `denomination` discriminator disambiguates in data, but product/marketing must decide: extend the promo system to USD, or rebrand one of them (VISION §11/§13 flags this as open). The mixed `GET .../credits` response returning both denominations is the concrete surface where this ambiguity is user-visible.
3. **Oracle staleness / TTL between sign and spend.** The cap is signed at time T with rate R; the trade settles at T+δ with the marketplace's oracle rate R'. If MANA spiked upward in δ, the trade's MANA cost could exceed the signed cap and the tx reverts. Mitigations: short `expiresAt` TTL (e.g. 120s), the buffer (§5), and a re-quote-on-revert retry. Also add a **staleness guard** on the oracle read (reject if the aggregator `updatedAt` is too old) — `credits-server` has no oracle today, so this guard is net-new.
4. **Rounding.** USD stored as integer cents (no float). MANA cap rounds **up** (never underfund). `1 credit = $0.10` means credits are always multiples of 10 cents; item prices must be whole-cent and ideally whole-credit to avoid fractional-credit display. Decide banker's vs ceil rounding for display of `usd_cents/10`.
5. **Pipeline MANA-denomination assumptions (must stay MANA-only).** Everything below treats amounts as MANA wei; USD credits must never flow through these paths as if MANA:
   - `adapters/db/db.ts:146-159, 192-201` — `availableAmount`/status = `amount − Σ credit_consumption.amount` (both MANA). USD rows must take the `usd_cents` branch instead.
   - `get-user-credits.ts:60-69` — `totalCredits`/`totals` sum MANA availableAmount. Must filter `denomination='MANA'`.
   - `iap-quote.ts:11, :81-82` and IAP caps — wei math; keep MANA-only.
   - `iap-refund.ts:77, :96` — `consumed = amount − availableAmount` and `formatEther` — MANA-only; a USD refund path is separate.
   - `season-service.ts` `WEEKLY_MANA_CAP` / `metrics-service.ts` `formatEther` — MANA-only reporting; exclude USD or convert explicitly.
   - `credits-squid-core` (`main.ts`, `slack.ts` `formatEther`) and `credits-pipes` (`credit_consumption.amount`) — MANA wei by definition; **do not change**. Reconciliation reads them as MANA and never writes USD back.
6. **TOCTOU on USD balance.** The IAP mint already documents a per-wallet cap TOCTOU (`iap-mint.ts:76-87`). The USD "reserve on authorize / release on expire" needs a per-wallet lock (advisory lock, mirroring `_withDailyCappedInsert`) so two concurrent purchases can't both pass the balance check and overspend the USD ledger.
7. **Cap-buffer never-consumed assumption.** Relies on the contract consuming only the trade's actual MANA (not the full `Credit.value`). Confirmed by `useCredits` semantics + `CreditUsed._value` = actual consumed (`abi/credits.ts:7,73`), but should be re-verified against the deployed CreditsManager version before mainnet.
8. **Where does the money-in ledger row's expiry live?** IAP uses `NEVER_EXPIRES_AT`; USD packs presumably also never expire (paid value), but confirm the legal/accounting stance on unspent prepaid balances (dormancy/escheatment).
```
