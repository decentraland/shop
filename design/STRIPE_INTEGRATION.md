# Stripe Integration — Exact Wiring Diffs

> Apply these to turn the scaffolded Stripe files into a live card→credits pipeline. All new
> code already exists (see `STRIPE_SPEC.md` §8) and typechecks/lints clean. This doc lists ONLY
> the edits to **shared wiring files** (routes / components / types / env) that the scaffold
> deliberately did NOT touch. Nothing here changes business logic.
>
> **Where it lives:** the Stripe endpoints are in **credits-server** (next to the USD ledger +
> IAP webhook precedent). shop-server is unchanged by this integration (its treasury/USDC leg is
> async and already has `POST /treasury/deposits`).

---

## A. credits-server — components.ts

Import and construct the two new components (after `db` exists; `stripeOrdersDb` needs `pg`,
`stripePayments` needs `config`/`logs`/`fetch`).

```ts
// add imports (near the other adapter/logic imports)
import { createStripeOrdersDbComponent } from './adapters/stripe-orders-db'
import { createStripePaymentsComponent } from './logic/stripe-payments'
```

```ts
// inside initComponents, after `const db = await createDbAdapter(...)`
const stripeOrdersDb = createStripeOrdersDbComponent({ pg })
const stripePayments = await createStripePaymentsComponent({ config, logs, fetch })
```

```ts
// add both to the returned components object
return {
  // …existing…
  stripeOrdersDb,
  stripePayments
}
```

## B. credits-server — src/types/components.ts (or system.ts)

Add the two interfaces to `BaseComponents`. Import them from the scaffolded modules.

```ts
// in src/types/components.ts add the imports…
import { IStripePaymentsComponent } from '../logic/stripe-payments'
import { IStripeOrdersDbComponent } from '../adapters/stripe-orders-db'
```

```ts
// …and the fields on BaseComponents (src/types/system.ts BaseComponents type)
export type BaseComponents = {
  // …existing…
  stripePayments: IStripePaymentsComponent
  stripeOrdersDb: IStripeOrdersDbComponent
}
```

> After this, `src/types/stripe-components.ts` (the temporary local augmentation) becomes
> redundant. **Optional cleanup:** switch the three handlers' import from
> `'../../types/stripe-components'` (`StripeHandlerContextWithPath`) back to `'../../types'`
> (`HandlerContextWithPath`) and delete `stripe-components.ts`. They compile either way — the
> interfaces are identical — so this is cosmetic and can be deferred.

## C. credits-server — src/controllers/routes.ts

Add three routes. `/credits/checkout` and `/credits/orders/:orderId` use the existing
`signedFetchMiddleware`. **`/credits/webhook` must have NO body-parser / NO signed-fetch** — the
handler reads the raw body itself for HMAC verification (exactly like `/apple/webhook`).

```ts
// imports (with the other handler imports)
import { createCheckoutSessionHandler } from './handlers/create-checkout-session'
import { stripeWebhookHandler } from './handlers/stripe-webhook'
import { getOrderStatusHandler } from './handlers/get-order-status'
```

```ts
// routes — place near the /credits/authorize block
// Shop "get credits" (Stripe). checkout + order status are signed-fetch (caller == buyer);
// the webhook's Stripe-Signature HMAC IS its auth (no signed-fetch, no body parser).
router.post('/credits/checkout', signedFetchMiddleware, createCheckoutSessionHandler)
router.get('/credits/orders/:orderId', signedFetchMiddleware, getOrderStatusHandler)
router.post('/credits/webhook', stripeWebhookHandler)
```

## D. credits-server — .env.default (+ real .env)

Add these (values shown are **fake placeholders** — never commit real keys):

```
# Stripe (Shop get-credits). Empty/unset STRIPE_ENABLED → the app falls back to the dev-mint mock.
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=sk_test_example123
STRIPE_WEBHOOK_SECRET=whsec_example123
# Where embedded Checkout returns the buyer (app route). {CHECKOUT_SESSION_ID} is substituted by Stripe.
STRIPE_RETURN_URL=http://localhost:5173/credits?session_id={CHECKOUT_SESSION_ID}
```

> Local dev: get `STRIPE_WEBHOOK_SECRET` from `stripe listen` (it prints a `whsec_…`). Keep
> `ALLOW_DEV_MINT=true` if you still want the mock/dev-mint path available in parallel.

## E. Migration

No action — `src/migrations/1783000000000_stripe-orders.ts` runs automatically on boot via
pg-component (creates `stripe_orders` + `stripe_events`). It is additive and reversible.

---

## F. app — src/config.ts

Already correct: `shopServerUrl` (empty in dev) and `stripePublishableKey` (`VITE_STRIPE_PK`)
exist. `payments-stripe.ts` targets `config.shopServerUrl || config.creditsServerUrl`, so with
`VITE_SHOP_SERVER_URL` empty the real endpoints resolve to the **credits-server** (where they
live). If you deploy the Stripe endpoints behind a different host, set `VITE_SHOP_SERVER_URL` to it.

`.env` for real mode:

```
VITE_STRIPE_PK=pk_test_example123
# leave VITE_SHOP_SERVER_URL empty to use the credits-server, OR set it to the payments host.
```

## G. app — src/lib/payments.ts (route the real seam)

`payments.ts` already branches on `isMockPayments()` (true when no `VITE_STRIPE_PK` / no
`shopServerUrl`). Wire the real branch to call `payments-stripe.ts` and pass the identity through.
Two small edits:

```ts
// top of file
import { createPackCheckoutReal, pollCreditGrantReal } from '~/lib/payments-stripe'
```

```ts
// in createPackCheckout, replace the "REAL SEAM" fetch block with:
if (!auth?.identity) throw new Error('Sign in to get credits.')
return createPackCheckoutReal(packId, auth.identity as AuthIdentity)
```

```ts
// in pollCreditGrant, replace the real while-loop with a delegate:
return pollCreditGrantReal(orderId, identity, { intervalMs, timeoutMs, signal })
// (thread the AuthIdentity in via the opts — see H; add `import type { AuthIdentity } from '@dcl/crypto'`)
```

## H. app — src/pages/GetCredits.tsx (identity through + poll ['usd-balance'])

`GetCredits.tsx` is **already correct** for the real path — no change strictly required:
- `startCheckout` already passes `{ address, identity }` to `createPackCheckout`.
- `onPaid` already calls `pollCreditGrant(checkout.orderId, { signal, address })` and, on success,
  runs `qc.invalidateQueries({ queryKey: ['usd-balance'] })` — the header balance refreshes.
- `RealCheckout.tsx` (embedded Checkout) is already mounted for non-mock sessions.

**Only change needed** is passing the **identity** into the poll so `payments-stripe` can signed-fetch
the order status. Update the `pollCreditGrant` call:

```ts
// onPaid()
const result = await pollCreditGrant(checkout.orderId, {
  signal: ac.signal,
  address: session?.address,
  identity: session?.identity            // ← add; used by the real signed-fetch poll
})
```

…and widen the `pollCreditGrant` opts type in `payments.ts` to accept `identity?: AuthIdentity`.

> **Return-from-Checkout note:** embedded Checkout with `onComplete` fires `onPaid` in-page (no
> redirect), so the existing flow works as-is. If you switch to **hosted** Checkout (`success_url`
> redirect) instead of embedded, add a small effect in `GetCredits` that reads `?session_id=` /
> your order id from the URL on mount and jumps straight to the `processing` poll.

---

## I. Verification checklist

1. credits-server: `npx tsc --noEmit` (clean today) + `yarn test` after wiring (add handler specs
   mirroring `apple-iap-webhook`'s tests — signature-fail 400, dedup 200, credit path).
2. `stripe listen --forward-to localhost:3000/credits/webhook`; `stripe trigger
   checkout.session.completed`; confirm a `user_credits` USD top-up row + `stripe_orders` → credited.
3. app: with `VITE_STRIPE_PK` set, buy a pack with `4242…`, confirm the balance chip updates and the
   poll flips to `credited`.
4. Mock path still works with Stripe off (`STRIPE_ENABLED=false`, no `VITE_STRIPE_PK`).

## J. Follow-ups (not scaffolded — see STRIPE_SPEC.md §4/§7)

- Refund / `charge.dispute.created` handling (reverse unspent USD, freeze spend) — mirror
  `logic/iap-refund.ts`.
- shop-server: trigger `POST /treasury/deposits` from Stripe settlement (the USDC leg).
- Add `charge.dispute.*` + `charge.refunded` to the `stripe listen` event list and the webhook switch.
