# Stripe setup — step-by-step (do this when you want the real card → credits flow)

This turns on **real card payments** for "Get credits". It's fully **flag-gated**: with the flags off
you keep using the dev-mint MOCK (what you've been testing with). Turning it on is a config flip —
no code changes.

## What Stripe does here (and doesn't)

- **In scope (this guide):** card → **USD credit top-up** on the buyer's ledger. Buyer pays with a
  card, credits appear. This is the whole user-facing flow.
- **Out of scope:** the treasury USDC leg (Stripe pays out **USDC on Polygon** → swap → refill the
  CreditsManager). That's the shop-server, runs async, and is **not needed to test buying credits**.
- **"Test mode" ≠ blockchain testnet.** Stripe's test mode is a sandbox with fake cards
  (`4242 4242 4242 4242`). It fully exercises the card → credits leg. (The USDC-on-Polygon payout
  leg has no end-to-end Stripe test-mode sim — test that leg separately against Amoy; see
  `SHOP_SERVER_SPEC.md`.)

Where the endpoints live: **credits-server** (next to the USD ledger). Full design in
`STRIPE_SPEC.md`; exact wiring already applied — see `STRIPE_INTEGRATION.md`.

---

## Prerequisites

1. A free Stripe account → https://dashboard.stripe.com (stay in **Test mode**, top-right toggle).
2. The Stripe CLI (for the local webhook): `brew install stripe/stripe-cli/stripe`

## Step 1 — Get your test keys

Dashboard → **Developers → API keys** (Test mode). Copy:
- **Publishable key** → `pk_test_…`
- **Secret key** → `sk_test_…`

## Step 2 — credits-server `.env`

Add (or flip) these in `/Users/juanma/Projects/dcl/credits-server/.env`:

```
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_YOURKEY
STRIPE_WEBHOOK_SECRET=whsec_FILL_IN_STEP_4
STRIPE_RETURN_URL=http://localhost:5174/credits?session_id={CHECKOUT_SESSION_ID}
```

Keep `ALLOW_DEV_MINT=true` if you still want the mock "Get test credits" button available in parallel.

## Step 3 — shop app `.env`

Add to `/Users/juanma/Projects/dcl/shop/app/.env` (create it if missing):

```
VITE_STRIPE_PK=pk_test_YOURKEY
```

Leave `VITE_SHOP_SERVER_URL` unset → the app calls the Stripe endpoints on the credits-server
(`localhost:3000`), which is where they live.

## Step 4 — start the webhook listener (gives you the webhook secret)

In its own terminal, each on one line:

```
stripe login
```
```
stripe listen --forward-to localhost:3000/credits/webhook
```

The `listen` command prints a `whsec_…` — paste it into `STRIPE_WEBHOOK_SECRET` (Step 2) and keep
this terminal running while you test.

## Step 5 — restart the services

```
cd /Users/juanma/Projects/dcl/credits-server && npm run start:local
```
(Restarting runs the pending migrations — `shop-usd-credits` + `stripe-orders` — and loads the new
routes.) Then restart the shop app dev server so it picks up `VITE_STRIPE_PK`:
```
cd /Users/juanma/Projects/dcl/shop/app && npm run dev
```

> Use whatever start command you normally use for the credits-server; the point is a fresh boot so
> the migration + Stripe routes load and it reads the new env.

## Step 6 — test the flow

1. Sign in, open **Get credits**, pick a pack → the embedded Stripe form appears (not the mock form).
2. Pay with the test card: number `4242 4242 4242 4242`, any **future** expiry, any CVC, any ZIP.
3. Payment succeeds → the `stripe listen` terminal shows `checkout.session.completed` forwarded →
   the order flips `processing → credited` → your credit balance updates in the header.

### Verify it worked
- `stripe listen` terminal shows the event delivered with a `200`.
- DB: a new `stripe_orders` row = `credited`, and a `user_credits` row with `denomination='USD'` for
  your address (the top-up). Balance chip reflects it.

### Handy test cards (Stripe test mode)
- Success: `4242 4242 4242 4242`
- Requires authentication (3DS): `4000 0025 0000 3155`
- Declined: `4000 0000 0000 9995`

## Rollback (back to mock)

Set `STRIPE_ENABLED=false` (or unset `VITE_STRIPE_PK`) and restart. Instant, safe — the dev-mint mock
path returns. No on-chain/DB state is tied to the flag.

---

## Notes & gotchas

- **Ports:** credits-server `:3000`, app dev `:5174` (adjust if yours differ; the webhook `--forward-to`
  and `STRIPE_RETURN_URL` must match your actual ports).
- **Never commit real keys.** They live only in `.env` (gitignored). The values in `.env.default` are
  fake placeholders.
- **Amounts are server-authoritative.** The client sends only a `packId`; the credits-server owns the
  price (`credit-pack-catalog.ts`). Don't trust a client-sent amount.
- **Going to production** (later): swap test keys for live keys, register the webhook endpoint in the
  Dashboard (Developers → Webhooks) instead of `stripe listen`, and add refund/dispute handling
  (`charge.refunded` / `charge.dispute.created`) — see `STRIPE_SPEC.md §4/§7`. Keys via a secrets
  manager, never env files in the repo.
- **Treasury leg** (USDC on Polygon → MANA refill) is independent — see the treasury status below /
  `SHOP_SERVER_SPEC.md`. Buying credits works without it (credits are granted on card success; the
  CreditsManager just needs to stay funded for the *spend* side).
