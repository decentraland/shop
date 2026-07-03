# The Shop — Credits Model (CANONICAL)

> **Status: LOCKED.** This is the single source of truth for how credits work in the Shop.
> If someone proposes a change, update THIS doc first, then the code. Companion doc with
> file-level implementation details: `CREDITS_USD_DENOMINATION_SPEC.md`.

---

## TL;DR (read this and you understand the whole thing)

- The buyer's **balance is in USD**, fixed: **1 credit = $0.10**. It never moves with MANA.
- The balance is backed by **USDC** we custody. **We never hold MANA speculatively.**
- There are **two completely different moments** people confuse:

  | Moment | What the user does | What happens | On-chain? | MANA involved? |
  |---|---|---|---|---|
  | **① Buy a pack** | pays with card | money → USDC in treasury; user's **USD balance goes up** | **No** | **No** |
  | **② Buy an item** | spends credits on a wearable/emote | convert **$→MANA at the oracle right now**, sign an **ephemeral credit** for this one purchase, settle it, **debit the USD balance** by the item's price | **Yes** | **Yes (transient)** |

- **We convert USD→MANA at moment ②, NEVER at moment ①.** This is "convert-at-spend" and it is the whole reason there is no price risk.

---

## Why there is NO "de nuestro bolsillo" price risk

The dangerous design (that we explicitly reject) would be: convert USD→MANA when the user **buys the pack**, hold that MANA, and let them spend days later. If MANA fell in between, the held MANA would be worth less than the credits we owe → we'd cover the gap. **We do not do this.**

What we actually do:

1. **Between pack-buy and item-buy we hold USDC, not MANA.** USDC is a dollar. Days can pass, MANA can swing — zero exposure, because we're sitting in dollars.
2. **The MANA authorization is created at the moment of the item purchase**, from a *fresh* oracle read, as an **ephemeral credit with a short TTL (minutes)** that is used immediately in the same checkout. There is no "signed a MANA amount, used it days later" gap.
3. **The USDC backing exactly funds the MANA the item needs.** A $2 item needs "$2 of MANA" at the current oracle; the treasury converts ~$2 of that user's USDC backing into exactly that MANA. In = out. No pocket.

The only residual exposure is the treasury's **working-balance float** — a small MANA buffer kept in the CreditsManager so most purchases don't wait for a swap. It's bounded and is a *treasury* concern (see `SHOP_SERVER_SPEC.md`), not a per-user one. Choosing the **just-in-time** refill strategy makes it exactly zero (at the cost of an extra on-chain step per purchase).

> Memory anchor: this matches the locked model — "Convert-at-spend keeps the price stable regardless of MANA moves" and "MANA net demand ≈ retained fees only."

---

## Glossary (the words that were confusing)

- **Standing credit (the OLD model):** a long-lived, **pre-signed on-chain MANA authorization** created when a credit is *granted* (season goal, admin, IAP). It sits as a balance and is drawn down over many purchases. `amount` = MANA, `signature` = set. This is what exists today.
- **USD balance (the NEW model):** the user's spendable money, in USD cents, off-chain, in our DB. This is the source of truth for "what can I afford". Goes **up** when they buy a pack, **down** when they buy an item.
- **Ephemeral credit (the NEW model):** a **single-use, short-TTL** on-chain MANA authorization created **on-demand at the moment of an item purchase**, sized to that one item ($→MANA at the oracle + small buffer), used immediately, never reused. It is **not** stored as a balance row — it's transient; its record is the *intent*.
- **Intent (`usd_purchase_intents` row):** the DB record the server writes when it signs an ephemeral credit. It says "I authorized $X (= Y MANA cap), salt Z, status PENDING". It (a) **reserves** the $X from the balance so it can't be double-spent, (b) is the **join key** (`salt`) to match the on-chain consumption the indexer reports, and (c) flips to **SETTLED** (debit confirmed) or **EXPIRED** (credit was signed but never used before TTL → reservation released).

---

## Data model: OLD vs NEW

### OLD — table `user_credits` (today, real schema)

| column | type | meaning |
|---|---|---|
| `id` | varchar(66) PK | the credit's salt / id (bytes32) |
| `user_address` | varchar(42) | owner |
| `amount` | numeric | **MANA wei** granted |
| `contract` | varchar(42) | CreditsManager it was signed against |
| `timestamp` | bigint | created (ms) |
| `signature` | text | **on-chain signature** (pre-signed at grant) |
| `season_id` | integer? | season (nullable) |
| `goal_id` | varchar? | goal (nullable) |
| `week_id` | integer? | week (nullable) |
| `expires_at` | bigint | expiry |
| `claimed_at` | bigint? | claimed |
| `credit_source` | enum | `goal` / `on_demand` / `iap` — **additive discriminator, default `goal`** |

- **Consumption is NOT in this DB.** The squid (`credits-pipes` / `credits-squid-core`) indexes on-chain `CreditUsed` into a `credit_consumption` table.
- `availableAmount = amount − Σ(credit_consumption for this credit)`; `status` ∈ AVAILABLE / PARTIALLY_USED / FULLY_USED / EXPIRED.
- **Every row = one standing, pre-signed MANA credit.** Balance = `Σ availableAmount` over non-expired rows, denominated in **MANA**.

### NEW — additive changes (behind a feature flag)

**`user_credits` gains 2 columns** (nothing existing is rewritten):

| new column | type | meaning |
|---|---|---|
| `denomination` | text, default `'MANA'` | `'MANA'` = legacy standing credit · `'USD'` = a USD top-up |
| `usd_cents` | bigint, nullable | for USD rows: the dollars added (a $10 pack → `1000`) |

- `amount` and `signature` become **nullable** (a USD top-up has no MANA amount and no on-chain signature).
- A **pack purchase** writes: `denomination='USD'`, `usd_cents=1000`, `amount=NULL`, `signature=NULL`, `credit_source='purchase'` (new source). **No on-chain credit is created here.**
- Legacy rows keep `denomination='MANA'` by default → **every existing query/path works unchanged.**

**New table `usd_purchase_intents`** (the per-item spends):

| column | meaning |
|---|---|
| `id` | intent id |
| `user_address` | buyer |
| `salt` | the ephemeral credit's salt (bytes32) — **join key to `credit_consumption`** |
| `usd_cents` | the item's USD price → **this is what we debit** |
| `mana_cap_wei` | the signed cap = usd→MANA at oracle + buffer |
| `oracle_rate` | MANA/USD rate at signing (audit) |
| `mana_settled_wei` | actual MANA consumed, from the squid (audit only) |
| `status` | `PENDING` (reserved) / `SETTLED` (confirmed) / `EXPIRED` (released) |
| `trade_id` | what was bought (marketplace trade ref) |
| `created_at` / `expires_at` | short TTL |

> The **ephemeral credit itself is never stored in `user_credits`** — it lives only as `{value: mana_cap, expiresAt, salt} + signature` returned to the front and used on-chain. Its durable record is the intent.

### The structural difference in one line

- **OLD:** grant → **pre-signed MANA credit row** → standing balance → drawn down on-chain. Balance = Σ availableAmount (MANA).
- **NEW:** pack-buy → **USD top-up row (no signature)** → USD balance; item-buy → **ephemeral signed MANA credit (per purchase, short TTL)** → settled → USD debited. Balance = Σ top-ups − Σ spends (USD).

---

## Balance computation (USD)

```
usd_balance_cents(user) =
      Σ usd_cents  WHERE denomination='USD' AND user=?           -- top-ups (packs)
    − Σ usd_cents  FROM usd_purchase_intents
                   WHERE user=? AND status IN ('PENDING','SETTLED')   -- reserved + confirmed spends
```

- `PENDING` counts against the balance so a second purchase can't spend the same dollars while the first is in flight (**reservation**).
- `SETTLED` = the on-chain use was observed by the indexer and reconciled.
- `EXPIRED` = the ephemeral credit was signed but never used before its TTL → the reservation is released (balance comes back).
- Legacy MANA credits, if any, are reported **separately** (their own MANA balance) so the two never mix.

---

## Front-end: how the Shop uses this (answering "how does the balance work now?")

**Today's marketplace:** on load it calls `GET /credits`, sums `availableAmount`, holds a MANA balance in memory, and uses those pre-signed credits to buy.

**The Shop:**

1. **On load / on connect →** `GET /users/:address/credits` (extended). It returns a **USD balance block**, e.g.:
   ```json
   { "usd": { "balanceCents": 800, "credits": 80 }, "credits": [ /* legacy MANA, usually empty */ ] }
   ```
   The front shows **"80 credits ($8.00)"** and uses `balanceCents` to decide what the user can afford. It does **not** need the on-chain credits list for affordability anymore.

2. **At item checkout →** a **new** call, `POST /credits/authorize` `{ tradeId, usdPriceCents }`:
   - server checks `usd_balance_cents ≥ usdPriceCents`,
   - reads the oracle, computes `mana_cap_wei` (+buffer),
   - signs the **ephemeral credit** `{value: mana_cap, expiresAt: now+~2min, salt}`,
   - writes a `PENDING` intent (reserving the dollars),
   - returns `{ credit, signature, maxCreditedValue }`.

3. The front submits `CreditsManager.useCredits({ credit, accept([trade]) })` (buyer signs the tx today; gasless/relayer later). **The front uses the `value` the server signed — it never computes MANA itself for USD credits.**

4. After the tx, the front refetches the balance. The indexer catches `CreditUsed(salt)` → the reconciler settles the intent → the balance shows `−$2 / −20 credits`, exactly.

> So yes: **balance comes from a balance endpoint; on-chain credits are generated on-demand at the item purchase, not at the pack purchase.**

### What the front NEVER does
- **Never swaps** USDC→MANA. That's the treasury (`shop-server`), on its own schedule, decoupled from any purchase.
- **Never computes MANA for USD credits.** The credits-server does that at sign time and bakes it into the signed ephemeral credit.
- The front reads `denomination` only to (a) display correctly and (b) pick the code path (USD → `/authorize`; legacy MANA → the existing standing-credit flow in `buy.ts`).

---

## Backward compatibility (safe rollout)

- `denomination` defaults to `'MANA'` → **no existing row is touched**, every legacy path works verbatim (same proven pattern as the `credit_source` IAP discriminator already in prod).
- All new behavior sits behind a **feature flag**; default off. Rollback = flag off (instant; USD untouched, MANA intact).
- The one hazard: any consumer that sums `amount`/`availableAmount` assuming MANA must filter `denomination='MANA'` (enumerated in the impl spec).
- Legacy MANA credits (promo) and new USD credits **coexist**; balances are reported in separate blocks and never summed together.

---

## Two end-to-end walk-throughs (numbers)

**Pack purchase.** User pays $10 → treasury holds $10 USDC → `user_credits` row `{denomination:'USD', usd_cents:1000}`. Balance = **100 credits ($10)**. Nothing on-chain, no MANA.

**Item purchase ($2), MANA at $0.2696.**
1. `/authorize`: balance 1000 ≥ 200 ✓; cap = (2 / 0.2696) × 1.02 ≈ **7.567 MANA**; sign ephemeral credit; `PENDING` intent `{usd_cents:200, salt}`. Balance shown drops to **80 (reserved)**.
2. Treasury ensures the CreditsManager has ≥ ~7.42 MANA (funded from the USDC backing).
3. `useCredits(...)` settles the $2 USD-pegged item → contract pulls **7.4184 MANA** (the buffer is untouched) → NFT to buyer → emits `CreditUsed(_value=7.4184 MANA, salt)`.
4. Indexer writes `credit_consumption(salt, 7.4184e18)`. Reconciler matches salt → intent `SETTLED`, `mana_settled_wei` stored (audit). **Debit = $2 (the item price), not the MANA.**
5. Balance confirmed **80 credits ($8)**.

**Same item, MANA moves:** at $0.20 the contract pulls 10 MANA; at $0.40 it pulls 5 MANA — the treasury funds each from exactly **$2** of the user's USDC, and the **USD debit is always $2 (20 credits)**. The oracle sizes both the MANA we buy and the MANA the item costs, at the same instant, so it cancels. The dollar is the only thing that stays put.
