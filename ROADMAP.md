# Decentraland Shop — Development Roadmap

Phased plan to ship the Shop (see [VISION.md](./VISION.md) for the model). Each phase has a **goal**,
the **work**, and an **exit criteria** (definition of done). Phases 1–3 are the critical path; 0 runs
alongside from day one.

---

## Phase 0 — Foundations & de-risking (parallel, starts now)

**Goal:** clear the non-code blockers and prove the risky bits before committing.

- **Legal:** T&C for custodial, non-refundable Credits (Robux-style). Money-transmission review.
- **Stripe:** open/enable account with stablecoin payments + fiat→crypto onramp; confirm country coverage.
- **Treasury custody:** pick MPC/HSM (Fireblocks / Turnkey / AWS KMS). No raw seeds anywhere.
- **Confirm scope & decisions:** wearables/emotes only (LAND stays legacy); reuse `CreditsManagerPolygon`;
  "Credits" naming (extend vs rebrand); credit unit ($/credit).
- **Spikes:** (a) card → USDC into our wallet via Stripe; (b) USDC → MANA swap on Polygon (DEX aggregator);
  (c) drive `CreditsManager.useCredits(accept([...]))` on testnet delivering an NFT to a buyer address.

**Exit:** the three spikes work end-to-end on testnet; legal + Stripe green-lit; decisions locked.

---

## Phase 1 — USD pricing (denomination) + Shop MVP browse

**Goal:** the base everything sits on — prices stable in Credits/USD.

- `marketplace-server`: support `USD_PEGGED_MANA` trades in create/validate + catalog/orders queries.
- Shop frontend (new app): browse wearables/emotes with prices shown in **Credits**.
- Oracle read path (Chainlink MANA/USD) for display and settlement math.

**Exit:** you can browse the Shop and every item shows a stable Credit price backed by a USD-pegged listing.

---

## Phase 2 — Credits ledger + card on-ramp

**Goal:** users can buy Credits with a card and see a balance.

- Extend `credits-server` into a **USD Credit ledger** (balance per user, in USD).
- Stripe integration: buy pack (500/1000/1500) → USDC into treasury custody → credit the ledger.
- Embedded wallet (email login) + balance UI.
- **Fraud controls:** Stripe Radar, per-account limits, velocity checks, initial holds.

**Exit:** a user logs in with email, buys a pack with a card, and sees a Credit balance backed by USDC.

---

## Phase 3 — Settlement (convert-at-spend) + one-click checkout + cart

**Goal:** spend Credits to buy items — the core loop.

- **Treasury/payments service:** per purchase, swap exact USDC→MANA, fund/authorize the CreditsManager.
- Per-purchase: sign `Credit`, submit `useCredits(credit, accept([...]))` via relayer, beneficiary = buyer.
- **Gasless, signature-free** checkout. **Cart** = group items by contract → one `accept([...])` per group
  (native batch; the Shop is mostly one contract + one currency, so usually a single tx).
- Reconciliation: ledger ↔ on-chain ↔ treasury balances.

**Exit:** a user with Credits buys one or several items in one click; NFTs arrive; books reconcile.

---

## Phase 4 — Creator flow

**Goal:** creators list, earn, and cash out.

- List in **Credits** (USD-pegged offchain trade) — primary via offchain (deprecate CollectionStore for new).
- Earnings view (Credits/USD, MANA visible as pro detail).
- **Cash-out** via Stripe stablecoin payout (MANA→USDC→fiat) + **hold/stake incentive** (lower withdrawal fee).

**Exit:** a creator lists an item in Credits, sells it, and can withdraw to fiat or hold MANA.

---

## Phase 5 — Migration tool ("bring your listings")

**Goal:** move existing liquidity into the Shop.

- On login, fetch the wallet's open listings from `marketplace-server` (offchain MANA trades + legacy orders).
- Re-price to fixed Credits (pre-fill from oracle, editable), **sign the new USD-pegged trade + cancel the old**.
- Batch signing where possible; handle legacy on-chain cancels (gas) separately.

**Exit:** a seller migrates their listings in a few clicks; old listings are cancelled, new ones are in Credits.

---

## Phase 6 — Hardening & launch

**Goal:** production-ready.

- Fraud/chargeback tuning, treasury monitoring & alerts, rate limits, incident runbooks.
- Analytics: GMV in USD, conversion funnel, MANA bought/held (fee sink), migration adoption.
- Rollout behind a feature flag → staged (internal → beta cohort → GA).

**Exit:** GA on for all users, dashboards live, on-call runbook in place.

---

## Critical path & dependencies

```
Phase 0 (foundations) ─────────────────────────────── (runs alongside all)
Phase 1 (USD pricing) → Phase 2 (credits + card) → Phase 3 (settlement + cart)
                                                        → Phase 4 (creator)
                                                        → Phase 5 (migration)
                                                        → Phase 6 (harden + launch)
```

- Phase 1 unblocks everything (stable pricing is the foundation).
- Phases 4 and 5 can run in parallel once Phase 3 lands.
- The cart (original ask) falls out almost for free in Phase 3 — one contract, one currency.
