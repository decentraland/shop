# Stripe / Buy-Credits — Implementation Plan

> Scope: how a Shop user buys a **credit pack** with a card, how that becomes a **USD
> balance top-up** on the buyer's ledger, and how the money becomes **USDC in our treasury**
> (decoupled). This is now a **concrete implementation plan** backed by scaffolded code —
> see `STRIPE_INTEGRATION.md` for the exact wiring diffs to apply.
>
> **Terminology:** this is an internal engineering doc, so it uses the real terms (Stripe,
> USDC, webhook, wallet). **None of these words ever appear in the UI** — the buyer only
> sees **"$"** and **"credits"** (see `../CONVENTIONS.md`). Research current as of **July 2026**.

---

## 0. The economic frame (from VISION.md / CREDITS_CANONICAL_MODEL.md)

- **1 credit = $0.10** (fixed USD peg). Packs: **$5 → 50, $10 → 100, $25 → 250, $50 → 500**.
- **Canonical model:** buying a pack is a **USD balance top-up** — a `user_credits` row with
  `denomination='USD'`, `usd_cents` set, `amount`/`signature` NULL, `credit_source='purchase'`.
  **No on-chain credit is created at pack-buy time** (that happens per-item = convert-at-spend).
- So a completed Stripe payment must result in **`db.createUsdTopUp(buyerAddress, usdCents)`**.
- Money path: **card → USD (Stripe balance) → USDC in treasury (async) → (at spend) USDC→MANA**.
  The **buy-credits** flow is only: **card → USD top-up on the ledger** + record the USDC inflow
  for the treasury to reconcile later. Convert-at-spend is a separate flow (already built:
  `/credits/authorize`).

---

## 1. Where the Stripe endpoints live — DECISION: **credits-server**

**The Stripe Checkout + webhook endpoints live in `credits-server`, not `shop-server`.** Justification:

1. **Right next to the USD ledger.** The whole point of a completed payment is
   `db.createUsdTopUp(...)`, which already exists in credits-server (`adapters/db/db.ts`). Putting
   the webhook there means the credit grant is a **local, in-process, transactional** call — no
   extra service hop, no shared secret between shop-server↔credits-server on the money path.
2. **The IAP precedent is the exact same shape** and already lives here: a signed real-money
   webhook (`apple-iap-webhook.ts`) with signature verification, event dedup, idempotent minting,
   and refund handling. We mirror it 1:1, reusing the same DI/handler/migration conventions.
3. **Signed-fetch auth is already here.** `POST /credits/checkout` must bind the order to the
   authenticated buyer (ADR-44); credits-server already runs `wellKnownComponents` signed-fetch
   middleware for `/credits/*`.
4. **shop-server is the treasury, off the buy path.** shop-server owns the **USDC leg** only
   (custody signer, USDC→MANA swap, CreditsManager refill, reconciliation). Its `POST
   /treasury/deposits` already documents its `reference` as a *"Stripe payment intent / onramp
   id"*. The treasury leg is **async and never blocks the user** (see §5).

So: **card leg + credit grant = credits-server; USDC treasury leg = shop-server (async).**

### Which Stripe product (unchanged research)

- **Card leg = Standard Embedded Checkout** (`ui_mode: 'embedded'`, `mode: 'payment'`). Charge a
  fixed USD amount (a $5 pack = `unit_amount: 500`). Most mature, GA, no per-buyer KYC, best test
  coverage. **We grant credits on card success — the user never waits for the on-chain leg.**
- **Treasury leg = stablecoin financial account** (Bridge-powered, Path B), run **async** by
  shop-server: convert accumulated USD balance → **USDC on Polygon** to our treasury wallet, on a
  schedule/trigger, reconciled via its webhooks. **Exact outbound-on-Polygon API/webhook names are
  private preview** — still an open item (§7).
- **Not the Crypto Onramp:** forces KYC on every buyer + US-only preview — wrong UX for a $5 pack.
- **No public crypto testnet settles end-to-end in Stripe test mode** (Amoy unsupported). Test the
  two legs separately (§6).

---

## 2. The buy-a-pack flow (as implemented)

```
┌────────┐        ┌────────────────┐        ┌────────┐                 ┌──────────────┐
│ Client │        │ credits-server │        │ Stripe │                 │ shop-server  │
│  (app) │        │ (ledger+Stripe)│        │        │                 │  (treasury)  │
└───┬────┘        └───────┬────────┘        └───┬────┘                 └──────┬───────┘
    │ 1. POST /credits/checkout {packId}        │                             │
    │    (signed-fetch: caller == buyer)        │                             │
    │ ─────────────────────────────────────────►│                            │
    │            2. create Checkout Session      │                            │
    │               (embedded, unit_amount,      │                            │
    │                client_reference_id=orderId,│                            │
    │                metadata{buyerAddress,...}, │                            │
    │                Idempotency-Key) ──────────►│                            │
    │            ◄──── client_secret ────────────│                            │
    │ ◄── {orderId, clientSecret} ──────────────│                             │
    │ 3. mount <EmbeddedCheckout/> → user pays   │                            │
    │ ──────────────────────────────────────────►│                           │
    │            4. webhook checkout.session.completed                        │
    │            ◄──────────────────────────────│ (verify HMAC sig,          │
    │               dedup event.id,              │  raw body)                 │
    │               claim order, createUsdTopUp) │                            │
    │ 5. GET /credits/orders/:orderId (poll, signed-fetch)                    │
    │ ─────────────────────────────────────────►│ → {status:'credited',      │
    │ ◄── credited, newBalance ──────────────────│    creditsGranted}         │
    │                                            │                            │
    │        (async, decoupled) 6. Stripe settles USD → shop-server records   │
    │                              the USDC inflow → later USD→USDC on Polygon►│
```

**Steps in words:**

1. Client sends only `{ packId }` — **never a price** (server owns pack→amount, see
   `logic/credit-pack-catalog.ts`). Signed-fetch binds the order to the authenticated buyer.
2. `create-checkout-session.ts`: writes a `stripe_orders` row `{status:'processing'}`, calls
   `stripe.checkout.sessions.create` (`ui_mode:'embedded'`, fixed `unit_amount`,
   `client_reference_id=orderId`, `metadata{orderId,buyerAddress,packId,credits}`, `Idempotency-Key
   = checkout_<orderId>`), stores `session_id`, returns `{orderId, clientSecret}`.
3. Client mounts the `client_secret` with Stripe's **Embedded Checkout** (`RealCheckout.tsx`, already
   in the app) and pays.
4. Stripe → `POST /credits/webhook`. `stripe-webhook.ts` **verifies the HMAC signature over the raw
   body**, **dedupes on `event.id`** (`stripe_events` UNIQUE PK), **atomically claims** the order
   (`processing→crediting`), then calls **`db.createUsdTopUp(buyerAddress, usdCents)`** and finalises
   `crediting→credited`. **This is the moment the balance goes up.**
5. Client **polls** `GET /credits/orders/:orderId` (signed-fetch) until `status !== 'processing'`.
6. **Async treasury leg (shop-server):** on Stripe payout/settlement, shop-server records the USDC
   inflow (`POST /treasury/deposits`, idempotent on the Stripe reference) and later converts USD→USDC
   on Polygon. **Never on the buy path.**

---

## 3. Backend contract (what the UI + webhook call)

### 3.1 UI → credits-server (the two endpoints the client uses)

```
POST /credits/checkout                        (signed-fetch, ADR-44: caller == buyer)
  req : { packId: string }                    // e.g. "pack_25"; server owns price/credits
  res : { orderId: string, clientSecret: string }   // Stripe embedded client_secret

GET  /credits/orders/:orderId                 (signed-fetch, buyer-scoped)
  res : { status: 'processing' | 'credited' | 'failed',
          creditsGranted?: number,            // present when credited
          newBalance?: number,                // credits balance (balanceCents/10)
          error?: string }
```

> These are exactly what the app's `lib/payments.ts` (`CheckoutSession` / `OrderStatus`) and the new
> `lib/payments-stripe.ts` are written against. The transient internal `crediting` state is reported
> as `processing`.

### 3.2 Stripe → credits-server (webhook)

```
POST /credits/webhook                         (Stripe → us; RAW body, NOT parsed JSON)
  header: Stripe-Signature: t=…,v1=…          // HMAC-SHA256 over `${t}.${rawBody}` w/ whsec_…
  verify: verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)  // in logic/stripe-payments.ts
```

**Events handled (`stripe-webhook.ts`):**

| Event | Action |
| --- | --- |
| `checkout.session.completed` (payment_status paid) | credit (idempotent), order → `credited` |
| `checkout.session.async_payment_succeeded` | credit (delayed methods) |
| `payment_intent.succeeded` | credit (resolves buyer via PI metadata) |
| `checkout.session.async_payment_failed` / `payment_intent.payment_failed` | order → `failed` |
| *(any other type)* | 200-ack, ignored (don't break the retry loop) |
| `charge.dispute.created` / `…closed` | **not yet handled — see §4 chargebacks (follow-up)** |

### 3.3 The credit grant — LOCAL call (not a network hop)

Because the webhook lives in credits-server, the grant is the **existing** in-process
`db.createUsdTopUp(buyerAddress, order.usdCents)`. No `POST /credits/grant` service call is needed
(the earlier spec's server-to-server contract is obviated by the co-location decision in §1).

### 3.4 Idempotency (mirrors the Apple IAP layering)

- **On create:** `Idempotency-Key: checkout_<orderId>` header on `sessions.create` (Stripe caches
  the response 24h per key), so a retried create returns the same session.
- **On consume:** Stripe delivers **at-least-once**, retries up to **72h**. Two layers, same as IAP:
  1. **Event dedup:** `stripe_events(id PK)` — `recordEventIfNew` short-circuits a replayed
     `event.id` before any mutation.
  2. **Order single-shot:** `claimForCrediting` flips `processing→crediting` in one atomic UPDATE
     guarded by `WHERE status='processing'`. Only the winner writes the top-up (so `session.completed`
     + `payment_intent.succeeded` both firing can't double-credit).
- **Address trust:** the buyer address written to the top-up is the **order's stored address** (bound
  at signed-fetch checkout time), not the webhook metadata — metadata is only a fallback.

---

## 4. Error / refund / chargeback handling

- **Card declined** → `payment_intent.payment_failed` → order `failed`; the poll returns `failed` and
  the UI shows a friendly retry. No balance change.
- **No resolvable order / unknown order / bad address** → 200-ack (retry won't help) + warn log for
  reconciliation (the Apple webhook pattern). The order stays `processing` or is marked `failed`.
- **Refund (`charge.refunded`) & chargeback (`charge.dispute.created`)** — **follow-up, not in this
  scaffold.** The canonical model debits USD at *item spend*, so a refund of a *pack* must reverse the
  **remaining** USD top-up. Recommended when built: mirror `iap-refund.ts` — on dispute/refund,
  reduce/flag the buyer's USD balance (only the unspent portion is reversible), **freeze spend**, and
  alert ops. **T&C must make credits non-refundable / non-cashable (Robux-style)** to bound this.
  Chargeback vs irreversible on-chain settlement is the key risk (see §5) — mitigate with 3D Secure,
  Stripe Radar, per-account velocity holds, and keeping the treasury USDC push **batched/decoupled**.

---

## 5. The treasury USDC leg is decoupled (never blocks the user)

- The user's **credits are granted at card success** (step 4), settled entirely inside credits-server.
- The **USDC leg is shop-server's job, async**: Stripe settles USD into our Stripe balance (≈T+2 for
  new US accounts); on a schedule/trigger shop-server converts USD→**USDC on Polygon** to the treasury
  wallet and records it via `POST /treasury/deposits` (idempotent on the Stripe reference). shop-server
  then keeps the audited CreditsManager funded (see `SHOP_SERVER_SPEC.md`).
- **Nothing on the buy path waits for USDC.** A single chargeback is therefore not 1:1 an irreversible
  transfer — the batched/decoupled push is itself a fraud mitigation.
- **Fees to budget:** card 2.9% + $0.30 (≈9% on a $5 pack — bias users to the "best value" pack);
  fiat→USDC conversion ≈1.5%. **Settlement:** Polygon USDC finality ≈1 min; card→Stripe balance ≈T+2.

---

## 6. Test-mode setup

**Keys** (fake placeholders — never commit real keys): publishable `pk_test_example123`, secret
`sk_test_example123`, webhook signing secret `whsec_example123`. Required env vars **by name**:
- credits-server: `STRIPE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RETURN_URL`.
- app: `VITE_STRIPE_PK`, `VITE_SHOP_SERVER_URL` (or leave empty to point payments at the credits-server).

**Test cards** (any future expiry, any CVC/ZIP): `4242 4242 4242 4242` success · `4000 0000 0000 0002`
decline · `4000 0000 0000 0259` succeeds then auto-disputed (chargeback) · `4000 0000 0000 3220` 3DS.

**Stripe CLI — local webhooks** (each command on its own line):

```
stripe login
```
```
stripe listen --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed --forward-to localhost:3000/credits/webhook
```
```
stripe trigger checkout.session.completed
```

`stripe listen` prints the local signing secret (`whsec_…`) → put it in `STRIPE_WEBHOOK_SECRET`.

**Two-leg testing (no single call settles Amoy in test mode):**
- **Card + credit grant:** fully testable in Stripe test mode (test keys + `4242…` + CLI forward).
- **USDC treasury leg:** tested independently against **Polygon Amoy** with the Circle Amoy faucet and
  our Amoy USDC `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` (see `SHOP_SERVER_SPEC.md` §7).

**Keep the MOCK path working:** with `STRIPE_ENABLED` unset (or no keys), `create-checkout-session`
returns 503 and the **app** stays on its built-in mock (`payments.ts` `isMockPayments()` → mock card
form + `devMintUsd` behind `ALLOW_DEV_MINT`). Real vs mock is a pure config flip; no code change.

---

## 7. Open items to confirm with Stripe (unchanged)

1. Exact REST endpoint + **webhook event names** for the **stablecoin financial-account outbound
   transfer on Polygon** (capability public; API contract gated behind preview registration).
2. Whether **automatic recurring** fiat→USDC-on-Polygon transfers are GA/preview for our region.
3. Confirm **Polygon** availability in **test-mode** simulation for the outbound path.
4. Build the **refund/dispute** handling (§4) mirroring `iap-refund.ts`, incl. USD-balance reversal
   of the unspent portion and spend-freeze.

---

## 8. What was scaffolded (see STRIPE_INTEGRATION.md for wiring)

**credits-server (new files):**
- `src/logic/stripe-payments.ts` — Stripe port: `createCheckoutSession` + `constructEvent`
  (HMAC verify, no SDK dep). Mirrors `apple-store-notifications.ts`.
- `src/adapters/stripe-orders-db.ts` — `stripe_orders` + `stripe_events` persistence
  (order lifecycle + webhook dedup).
- `src/logic/credit-pack-catalog.ts` — server-authoritative pack→price/credits map.
- `src/controllers/handlers/create-checkout-session.ts` — `POST /credits/checkout`.
- `src/controllers/handlers/stripe-webhook.ts` — `POST /credits/webhook`.
- `src/controllers/handlers/get-order-status.ts` — `GET /credits/orders/:orderId`.
- `src/types/stripe-components.ts` — local type augmentation so the handlers compile before the
  shared wiring files are edited (integration replaces this with real `types/components.ts` entries).
- `src/migrations/1783000000000_stripe-orders.ts` — the two tables.

**app (new file):**
- `src/lib/payments-stripe.ts` — real signed-fetch checkout + order-poll (the MOCK stays in
  `payments.ts`). `RealCheckout.tsx` (embedded Checkout) already exists.

### Sources
Stripe docs (July 2026): Embedded Checkout · Checkout Sessions API · Webhooks (signatures, retries) ·
Testing · Stripe CLI · Stablecoin/Treasury (private preview) · Pricing.
