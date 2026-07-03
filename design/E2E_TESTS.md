# E2E tests (the Shop)

Browser-level happy-path tests that drive the **real app** in headless Chrome, with the **wallet and
all network mocked** — no real login, no real servers, no on-chain transactions.

Run: `cd shop/app && npm run test:e2e` (starts a dedicated dev server on :5273, tears it down after).
Files: `shop/app/e2e/*.e2e.ts`. Config: `vitest.e2e.config.ts` (node env, serial).

## How login is solved (no popup, no real signature)

The app restores a session on load via `decentraland-connect` (`tryPreviousConnection` → `window.ethereum`)
+ `@dcl/single-sign-on-client` (identity in localStorage). So the harness (`e2e/helpers/session.ts`):

1. Builds a **real, well-formed `AuthIdentity`** for a fixed fake test key using `@dcl/crypto` (node).
2. Via `page.evaluateOnNewDocument`, before the app loads: seeds the two localStorage keys
   (`decentraland-connect-storage-key` = `{providerType:'injected',chainId}` and
   `single-sign-on-<addr>` = the identity) and installs a **mock EIP-1193 `window.ethereum`**
   (accounts / chainId / signTypedData / sendTransaction all canned).

Result: `restoreSession()` yields a full session through the **exact production code path** — just a
fake provider underneath. `decentraland-crypto-fetch` still signs requests with the real ephemeral
key; the mocked servers don't verify them.

## How the network is mocked

`e2e/helpers/app.ts` intercepts every request (Puppeteer) and routes by host/path:
- **HTTP APIs** (marketplace-server, credits-server, builder, peer profiles) → fixtures (`e2e/fixtures.ts`).
- **JSON-RPC** (`config.rpcUrl`) → `e2e/helpers/rpc.ts`: canned, ABI-encoded reads. Notably
  `isApprovedForAll`/`globalMinters` return **true**, so `ensureApproval`/`ensureMinter` short-circuit
  and **no on-chain tx is ever needed** in the happy paths — only the off-chain signature + POST.
- Web fonts / images / the WearablePreview iframe → stubbed (no external hits).

A spec can override fixtures per run: `launchApp({ path: '/import', fixtures: { importable: {data: []} } })`.

## Covered happy paths (9 tests / 8 files)

- **publish.e2e** — a creator publishes a created item (primary): My Assets → Your creations → Put on
  sale → success.
- **list-owned.e2e** — a user lists an owned item (secondary) for resale → success.
- **import.e2e** — Import your listings: both categories shown with auto-converted prices (100 MANA →
  270 credits), "List all" → the migrate modal lists each → congrats.
- **browse.e2e** — the shop grid shows credit-buyable listings; rarity filter is server-side.
- **detail.e2e** — a deep-linked item resolves as buyable (Buy now / Add to cart) + add-to-cart works.
- **favorites.e2e** — hearting an item persists it into My Favorites.
- **buy.e2e** — item detail → Buy now → the useCredits "tx" (via the mock wallet's
  `eth_sendTransaction` + canned receipt) → navigates to /success.
- **cart.e2e** — add to cart → cart → Checkout (batch buy) → /success.

Login is implicitly asserted by every spec (the gated pages only render when a session exists).

## What these tests DO and DON'T catch

They catch: broken UI wiring, routing, the session/restore path, the shape of every request the app
sends and how it maps responses into the UI, the client-side conversions (MANA→credits), and that the
full click-throughs reach success. A regression in any of those fails a test.

They do NOT catch (by design — everything past the network boundary is mocked):
- **Server/contract correctness** — the mocks accept any signature/trade and every read says
  "approved"; they don't validate signed-fetch, the EIP-712 signature, or the trade. The real
  signature/settlement is validated by the manual Amoy e2e (tx `0x1bed88…`, CREDITS_CANONICAL_MODEL.md)
  and unit tests (`buy.spec.ts` covers the real useCredits/accept ABI encoding).
- **On-chain reverts / gas / real balances** — `eth_sendTransaction` always "succeeds"; a real revert
  (insufficient credits, NotEffective, gas floor) isn't exercised here.
- **Indexing latency / real data** — fixtures are instant + deterministic.
- **Visual regressions** — assertions are on text/behavior, not pixels.

## Adding a spec

Import `launchApp` from `helpers/app`, `waitForText`/`clickByText`/`clickWhenEnabled` from
`helpers/dom`. `waitForText` is case-insensitive (matches uppercased buttons). Assert on rendered
text; price inputs hold values (not innerText) — read them via `$$eval('.imp-price__input', …)`.
