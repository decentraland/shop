# Gasless Checkout — Integration Guide (exact diffs + env)

> Apply these to turn on gasless checkout. **Nothing here is applied yet** — the scaffold is
> new files only; normal buyer-submitted checkout is untouched and remains the default.
> Read `GASLESS_SPEC.md` first (meta-tx verdict + flow).

## TL;DR verdict

The deployed `CreditsManagerPolygon` (Amoy `0x8052…fb3`) natively supports meta-transactions
(`executeMetaTransaction` + `getNonce`), and DCL already runs an OpenZeppelin Relayer on Amoy
behind `transactions-server`. **Gasless works today with zero contract/server work** — you only
wire the frontend to sign a meta-tx and POST to the relayer.

---

## New files (already scaffolded, no wiring needed)

- `app/src/lib/gasless-config.ts` — feature flag + relayer URL (its own env vars).
- `app/src/lib/buy-gasless.ts` — `buyGasless`, `buyManyGasless`, `waitForSettlement`,
  `GaslessUnavailableError`. Same call shape as `lib/buy.ts`.
- `server/src/controllers/handlers/relay-meta-tx.ts` — OPTIONAL self-hosted relayer stub
  (default backend is DCL's transactions-server; this is only if you want your own relayer).

---

## 1. Env vars

**Shop app** (`app/.env` / deployment env — Vite `VITE_` prefix):

```bash
# Turn gasless ON (default OFF → normal buyer-submitted checkout)
VITE_GASLESS_CHECKOUT=1

# Meta-tx relayer (transactions-server shape). Default already points at DCL's Amoy/dev relayer,
# so you can omit this to use the shared infra. Set it only to use a self-hosted relayer.
VITE_RELAYER_URL=https://transactions-api.decentraland.zone/v1
# self-hosted alternative: VITE_RELAYER_URL=http://localhost:5010   (the shop-server stub, once wired)
```

**shop-server** (ONLY if self-hosting the relayer — otherwise skip entirely):

```bash
# Amoy dev relayer wallet (gas payer). DEV ONLY — never a real key in prod; use KMS (see §3).
RELAYER_MODE=dev                 # dev | kms
DEV_RELAYER_PRIVATE_KEY=0x<fake-throwaway-amoy-key>   # e.g. 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
RELAYER_RPC_URL=https://rpc.decentraland.org/amoy
# kms mode instead: RELAYER_KMS_KEY_ID=alias/shop-relayer-signer-dev
```

---

## 2. Wire the frontend (2 call sites)

The gasless functions have the **same signature** as the existing buy functions, so wiring is a
flag check + a fallback. Both edits are additive.

### 2a. `app/src/pages/ItemDetail.tsx` (single-item buy, ~line 192)

Add imports near the existing buy imports:

```ts
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
```

Replace the `await buyWithCredits({...})` call with a gasless-first, auto-fallback block:

```ts
const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, usdCents, buyableTradeId)
const buyArgs = { trade, buyer: session.address, signer: session.signer, credits: [credit], maxCreditedValue }
if (gaslessEnabled()) {
  try {
    const txHash = await buyGasless(buyArgs)   // buyer signs off-chain; relayer pays gas
    await waitForSettlement(txHash)
  } catch (e) {
    if (!(e instanceof GaslessUnavailableError)) throw e
    await buyWithCredits(buyArgs)              // fallback: buyer submits + pays gas
  }
} else {
  await buyWithCredits(buyArgs)
}
```

### 2b. `app/src/pages/Cart.tsx` (batch checkout, ~line 80)

Add imports:

```ts
import { buyManyWithCredits, type CreditPurchase } from '~/lib/buy'
import { buyManyGasless, waitForSettlement, GaslessUnavailableError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
```

Replace `const hashes = await buyManyWithCredits({ purchases, buyer, signer })` with:

```ts
let hashes: string[]
if (gaslessEnabled()) {
  try {
    hashes = await buyManyGasless({ purchases, buyer: session.address, signer: session.signer })
    await Promise.all(hashes.map(h => waitForSettlement(h)))
  } catch (e) {
    if (!(e instanceof GaslessUnavailableError)) throw e
    hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
  }
} else {
  hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
}
```

The existing `cancelUsdIntents(reservedSalts)` error path stays as-is — it releases the reserved
$ if either the gasless or the fallback path fails before a broadcast tx. No copy changes needed;
`"Confirming your order…"` / `"Purchased! 🎉"` already fit the web2-first rule (no gas/sign/chain
wording). See `GASLESS_SPEC.md §7`.

> That's the whole frontend integration. With `VITE_GASLESS_CHECKOUT=1` and the default relayer
> URL, purchases go gasless against DCL's Amoy relayer.

---

## 3. (OPTIONAL) Self-host the relayer in shop-server

Only if you don't want to use DCL's shared relayer. The stub
`server/src/controllers/handlers/relay-meta-tx.ts` returns 501 until you wire a `relayer`
component. Three small edits:

### 3a. Add the component interface — `server/src/types/components.ts`

```ts
export interface IRelayerComponent {
  getAddress(): Promise<string>
  sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string }>
}
```

### 3b. Register it — `server/src/types/system.ts` (add to `BaseComponents`)

```ts
export type BaseComponents = {
  // …existing…
  relayer: IRelayerComponent
}
```

And create `server/src/adapters/relayer.ts` (dev impl = ethers `Wallet` from
`DEV_RELAYER_PRIVATE_KEY` on `RELAYER_RPC_URL`; prod impl = KMS, mirroring
`adapters/signer` from `SHOP_SERVER_SPEC.md §3` — same 2-method interface, so you can literally
reuse the treasury signer factory). Instantiate it in `server/src/components.ts` and pass into
the components object.

### 3c. Wire the route — `server/src/controllers/routes.ts`

```ts
import { relayMetaTxHandler } from './handlers/relay-meta-tx'
// …inside setupRouter, PUBLIC (no bearer — the buyer's EIP-712 signature is the auth):
router.post('/transactions', relayMetaTxHandler)
```

Then point the app at it: `VITE_RELAYER_URL=http://localhost:5010` (or your shop-server host).

> Security note: the `/transactions` endpoint is intentionally unauthenticated — anyone can ask
> the relayer to broadcast a **buyer-signed** meta-tx, and the buyer's signature + the on-chain
> nonce/credit single-use rules are what make it safe (a relayer cannot alter what executes).
> Add rate-limiting / an allow-list of target contracts (only the CreditsManager) + a per-address
> throttle before prod so the relayer wallet's gas can't be drained by spam. See `GASLESS_SPEC.md §5`.

---

## 4. Verify

- **Type/build:** `cd app && npx tsc --noEmit` (green) · `cd server && npx tsc --noEmit -p tsconfig.json` (green).
- **Flag off (default):** unset `VITE_GASLESS_CHECKOUT` → checkout uses `buyWithCredits` exactly
  as today (buyer pays gas). Zero behavior change.
- **Flag on, DCL relayer:** `VITE_GASLESS_CHECKOUT=1`, buy an item → wallet shows a **signature**
  request (no gas/confirm-transaction prompt), the relayer broadcasts, the item arrives, the $
  balance debits once the intent settles.
- **Relayer down:** the app auto-falls back to `buyWithCredits` (buyer submits) — the sale still
  completes, just with a gas prompt.

---

## 5. Rollback

Set `VITE_GASLESS_CHECKOUT=0` (or unset). Instant, safe: everything reverts to buyer-submitted
checkout. No on-chain state, no server state, no credits-server changes are involved in the flag.
