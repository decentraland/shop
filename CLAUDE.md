# Shop — project guidance for Claude

A web2-first storefront for Decentraland wearables and emotes. Prices show in **fixed-USD credits** (1 credit = $0.10); the blockchain plumbing (MANA, signatures, gas, chains) is hidden. Credits are backed by USD and settle in MANA at spend time, so the existing on-chain marketplace guarantees hold.

## Repo layout

| Path | What it is |
| --- | --- |
| `app/` | The storefront — Vite + React + TypeScript. **Almost all work happens here.** |
| `tools/migrate-listings/` | CLI that converts a seller's MANA-priced listings into credit-priced ones. |
| `design/` | Specs and design docs — the source of truth for feature behavior (see below). |
| `VISION.md`, `ROADMAP.md`, `CONVENTIONS.md` | Product vision, roadmap, code conventions. |

The **treasury service** (USDC → MANA refill + reconciliation) lives in its own repo, `decentraland/shop-server`.

The `app/` directory is a working directory. **Run `npm`, tests, and `tsc` from `app/`** — commands against the repo root won't find the app's `package.json`.

## Web2-first: NO web3/blockchain terms in the UI (hard rule)

The Shop targets mass web2 users. **Never** surface crypto jargon in any user-facing copy — buttons, labels, statuses, errors, tooltips, empty states. This is a strict convention; see `CONVENTIONS.md` for the full banned-word list and the approved replacements. The short version:

- Banned: wallet, MetaMask, sign / signature, chain / network, on-chain, gas, transaction / tx, approval, contract, MANA, blockchain, mint, token, "wallet address".
- Say instead: "Sign in" / "Sign out" (not connect/disconnect wallet); "credits" (not MANA/token); "account" (not wallet address); generic friendly errors (not raw web3 errors).

Internally, listings are **chain-agnostic**: creating a listing is an off-chain EIP-712 signature, so **do not gate listing on the wallet's chain.** Read contract state via the dedicated Amoy RPC (`config.rpcUrl`), not the wallet provider. Only real transactions (e.g. `setApprovalForAll`) need the right chain — switch just-in-time, silently.

## Architecture (app/src)

- **Stack:** Vite 6 + React 18 + TypeScript (strict), React Router v6, `@tanstack/react-query` for server state, `zustand` for client state, `react-intl` for i18n, Emotion + `decentraland-ui2` (MUI) for the footer/theme, Sentry for monitoring, Stripe for credit purchases.
- **Path alias:** `~` → `src/` (configured in `tsconfig.json`, `vite.config.ts`, and both vitest configs). Import as `~/lib/api`, `~/store/cart`, etc.
- **`src/pages/`** — one component per route. Routes are declared in `src/App.tsx`; every page except the eager `Overview` (home) is `lazy()`-loaded and code-split.
- **`src/components/`** — shared UI (NavBar, cards, modals, checkout, fitting room, footer…).
- **`src/store/`** — zustand stores (`cart`, `wallet`, `favorites`, `follows`, `locale`, `toast`). Client/session state only; these hold high unit-coverage thresholds.
- **`src/lib/`** — the logic layer: API clients, buy/sell/import flows, trade encoding, credits, pricing, auth, analytics, monitoring. Pure-ish and heavily unit-tested (each `foo.ts` has a `foo.spec.ts`). This is where business logic belongs, not in components.
- **`src/hooks/`** — React-query-backed hooks (`useBalance`, `useProfile`, `useManaRate`, …) and `useAccountWatcher` (reloads when the injected wallet switches accounts).
- **`src/config/`** — runtime config via `@dcl/ui-env`. **One build serves every environment**; the env is chosen at runtime from the hostname, overridable with `?env=`. The `env/{dev,stg,prod}.json` files hold only PUBLIC, client-safe values (hosts, chain id, public ingest keys) — **never a real secret.** `VITE_*` vars (from `.env.local` / the e2e harness) override the JSON for local dev.
- **`src/intl/`** — i18n. Author nested JSON in `en.json` / `es.json`; it's flattened to `a.b.c` keys at load. Use `t('a.b.c')` (marketplace-style wrapper over react-intl) for user-facing strings — it works with or without a provider (defaults to English, keeps unit tests green).

## Design specs are the source of truth

Feature behavior is specified in `design/*.md` before/alongside implementation. Before changing a flow, read the matching spec — e.g. `BUY_WITH_CREDITS_SPEC.md`, `SELL_INTEGRATION_SPEC.md`, `FLASH_SALES_SPEC.md`, `FITTING_ROOM_SPEC.md`, `I18N_SPEC.md`, `STRIPE_SPEC.md`, `CREDITS_CANONICAL_MODEL.md`, `SHOP_TRACKING_SPEC.md`, `E2E_TESTS.md`. Analytics event names/props are governed by the tracking spec — keep them in sync.

## Code style

- Prettier: config in `.prettierrc`. Match the surrounding style.
- TypeScript strict, `noUnusedLocals` / `noUnusedParameters` on. Prefer `type` imports.
- Never surface a raw error to the user (web2-first + PII rule) — report it to Sentry via `captureError` and show human-friendly copy.

## Commands (run from `app/`)

- `npm run dev` — dev server (port 5173).
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — ESLint over `src`.
- `npm test` — unit tests (vitest, jsdom). `src/lib/**` and `src/store/**` have coverage thresholds.
- `npm run test:e2e` — end-to-end happy paths in a real headless browser with wallet + network fully mocked (no real login, servers, or on-chain tx). Spins up its own dev server on port 5273.

Per the auto-memory: run tests/`tsc` with the app-local binaries (`node_modules/.bin/…`), and a one-off 60s e2e timeout is usually contention flake — re-run the spec alone before investigating.

## Testing conventions

- **Unit** (`*.spec.ts` / `*.spec.tsx`) sit next to their subject. `lib/` and `store/` are the well-covered logic layer; pages/components are exercised mainly by e2e.
- **E2E** (`app/e2e/*.e2e.ts`) drive the built app via puppeteer. The wallet uses a deterministic fake key, contract reads return canned "already approved" values, and all HTTP is mocked per-page (`e2e/helpers/`). Never introduce a real network call or real key. Use `page.setViewport(...)` + screenshots to verify responsive layout.

## Responsive / mobile design (standing requirement)

**Every feature, addition, or edit MUST work on mobile as well as desktop.** Responsive behavior is part of "done" for any UI change.

When adding or editing UI:

- Design for small screens too, not just the wide desktop layout. Verify the change at a narrow viewport (≤ 768px) as well as desktop before considering it complete.
- Touch targets stay comfortably tappable (~44px), and hover-only affordances need a tap/focus equivalent (mobile has no hover).
- Overlays anchored to a trigger (dropdowns, popovers) must not spill off-screen on narrow widths — constrain width and reposition as needed.

### Breakpoints in use

The primary mobile breakpoint in this codebase is **`max-width: 768px`** (see `app/src/index.css`); `820px` / `900px` / `720px` are used for a few specific layout shifts. Reuse the existing breakpoints rather than inventing new ones unless there's a clear reason.

### Verifying responsive changes

The e2e harness (`app/e2e/`, run via `node_modules/.bin/vitest run --config vitest.e2e.config.ts` from `app/`) drives a real headless browser — use `page.setViewport({ width, height })` to check a mobile viewport and screenshot to confirm layout.
