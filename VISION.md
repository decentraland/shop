# Decentraland Shop — Vision & Economic Model

> A new marketplace surface for Decentraland, Roblox-style: **fixed prices, a card, one click.**
> Buyers never touch crypto. MANA runs underneath. Built on the existing **audited** offchain
> contract and infra — this is a new product layer, **not** a from-scratch chain rebuild.

---

## 1. The idea in one paragraph

Today buying in the marketplace means: get MANA on an exchange, bring it to a self-managed wallet,
approve it, sign a transaction, pay gas — and the price you see is in MANA, so its real cost drifts
as MANA moves. The Shop hides all of that. You log in with an email, buy **Credits** with a card,
and every item has a **fixed price in Credits (pegged to USD)**. Underneath, Credits are backed by
dollars and each purchase converts to MANA at the moment of sale, so MANA stays the settlement token
and keeps its utility, while the buyer never sees it.

---

## 2. The keys (economic model)

1. **Credits — fixed price in USD.** `1 credit = $0.10` (illustrative). The only unit a buyer ever sees.
2. **Items — fixed price in USD**, shown as Credits. Stable regardless of MANA's price.
3. **Liquidity is expressed in Credits** (i.e. in USD), not in MANA.
4. **The money path:** card → **USDC** (we custody) → at the instant of each purchase, swap the exact
   **USDC → MANA** → settle the trade on the offchain contract. **Convert-at-spend** — we never hold
   MANA over time, so MANA's price moving never creates a loss for us.
5. **MANA stays the settlement token.** Keeps its utility and lets us **reuse the audited contract**.
   Net MANA demand = the **fee we retain in MANA** (+ creators who hold). No burn for now.
6. **Buyers:** email login, embedded wallet, gasless, no signatures. **Assets are self-custody** (NFTs
   land in the buyer's wallet); **currency is custodial** (Credits = our ledger, backed by USDC).
7. **Creators:** earn MANA, then choose to **hold** or **cash out** to fiat.

---

## 3. The mental model: three amounts in one purchase

The thing that confuses everyone is that a single purchase involves three different amounts:

| Amount | Value (example) | Unit |
| --- | --- | --- |
| What the buyer sees & pays | 10 credits | = **$1** (fixed) |
| What we hold as backing | **$1** | USDC (the dollars they paid) |
| What moves on-chain at settle | ~**1.5 MANA** | MANA (the $1 converted at the oracle, that instant) |

> **`1 credit = 1 MANA` is dead.** That was the old promo-credits rule. In the Shop, **`1 credit = $0.10`**,
> and the MANA amount is computed fresh at each sale.

---

## 4. Why there is no MANA price risk (convert-at-spend)

We hold the user's money as **USDC (dollars)** the whole time. We convert to MANA **only at the instant
of each item purchase**, buying exactly what that purchase needs at that moment's price.

Example — user buys 100 credits for $10 (we hold **$10 USDC**):

- **Day 1, MANA = $0.66.** Buy a $1 item → take $1, swap → **1.5 MANA**, settle. We have $9 left.
- **Day 30, MANA fell to $0.33.** Buy another $1 item → take $1, swap → now **3 MANA**, settle. We have $8 left.

We never top up MANA from our pocket. MANA falling just means $1 buys *more* MANA — which is exactly what
the item ($1 = 3 MANA now) needs. **It self-balances because the dollar spent and the MANA bought are
priced at the same moment.**

> ⚠️ **Nuance (funding):** price risk only appears if we **hold MANA over time**. The `CreditsManager` pays
> from its own MANA balance, so funding it is a treasury op (see §7). Two ways: **just-in-time** per purchase
> (swap right before each sale → zero standing MANA, ~zero risk, but 2 on-chain steps) or a **small working
> balance** refilled from USDC in batches (1 tx per purchase, fast UX, but a *small, bounded* float risk on
> the buffer). Recommended: a minimal working balance, refilled often — the risk is tiny (buffer ≈
> minutes/hours of volume, MANA moves <1% intra-hour).

---

## 5. MANA economics — is this bullish?

Per $1 sale (MANA $0.66 → 1.5 MANA), assuming the creator cashes out:

- We **buy** 1.5 MANA (with the user's $1) → +1.5 buy pressure.
- The creator **receives** ~1.46 MANA and **sells** to get fiat → −1.46 sell pressure.
- We **retain** the fee ~0.04 MANA (held) → −0.04 removed from circulation.
- **Net market impact ≈ +0.04 = the fee.**

So **routing through MANA creates volume, not net demand** — our buy is offset by the creator's sell on
the other side of the same trade. **Net-new demand = what someone retains:** the fee we hold in MANA, any
creators who hold. Levers to make it more bullish: hold more in MANA, incentivize creators to hold, or
**burn** the fee (strongest — deferred for now). Versus a pure-fiat design with no MANA, this is strictly
better; versus today, it's about the same on settlement plus the retained fee.

---

## 6. Payments — Stripe vs Bridge

**Use Stripe. Bridge is now Stripe's stablecoin engine under the hood — you don't integrate it separately.**

- **Bridge** was acquired by Stripe ($1.1B, closed early 2025). Standalone, Bridge is stablecoin infra
  (fiat↔stablecoin orchestration, virtual accounts, custody, card/stablecoin issuance). We'd only touch
  Bridge's raw Orchestration API if we outgrow Stripe's abstractions.
- **Stripe** gives us the whole thing in one integration: it's the **card acquirer** (its core strength)
  and, powered by Bridge, handles the **USDC** side. Relevant Stripe products:
  - **Fiat-to-Crypto Onramp** (beta) — card → crypto, hosted or embedded. The "buy Credits" flow.
  - **Stablecoin Financial Accounts / Treasury** — hold & move **USDC**; on-chain payout to a wallet we
    control. Where our Credit backing lives.
  - **Stablecoin payouts** — for **creator cash-out**.
- **Settlement timing:** Polygon ~1 min, Solana <5s, Ethereum ~2 min. Fee ~1.5% on stablecoin payments.
- **Onboarding:** a Stripe account with crypto/stablecoin features enabled (70+ countries as of 2026),
  plus KYC handled by Stripe/Bridge. Integrate via Checkout / Elements / Payment Intents / Onramp SDK.

> Practical read: **card acceptance = Stripe; USDC custody & conversion = Stripe (Bridge inside).**
> We do not need a separate Bridge integration for v1.

---

## 7. Settlement architecture — **no new marketplace contract**

The settlement layer is the **existing, audited [`CreditsManagerPolygon`]**. It already custodies MANA,
takes a backend-signed authorization, and calls `accept([...])` — delivering NFTs to the buyer, several
items in one transaction. New work is **off-chain**.

**Keys / signers (never a raw seed in the backend):**

- **Treasury signer** — holds USDC (from Stripe) and does the USDC→MANA swaps. **Managed key** (MPC/HSM:
  Fireblocks / Turnkey / AWS KMS). High value → custody, never plaintext seed.
- **Credits signer** — signs the per-purchase authorization (`Credit`). Already exists in credits-server.
- **Relayer** — pays gas to submit `useCredits(...)`. Low-value hot key.

**Per-purchase flow (convert-at-spend):**

1. Backend validates the buyer's Credit balance in the ledger and deducts it.
2. Ensures the `CreditsManager` holds enough MANA to settle (funded from treasury USDC — see **Funding**).
3. Signs a `Credit` and submits `useCredits(credit, accept([t1,t2,t3]))`, with the trade's sent-asset
   `beneficiary = buyer's wallet`.
4. `CreditsManager` moves MANA → creator, fee → us; NFTs → buyer.

**Funding — when we swap USDC → MANA.** The `CreditsManager` pays from its *own* MANA balance, so funding it
is a **treasury operation, separate from the buyer's transaction**. Two options:

- **Small working balance (recommended):** keep a modest MANA buffer in the contract, refilled from USDC in
  batches → **1 tx per purchase** (fast). Carries a *small, bounded* price risk on the buffer, kept tiny by
  sizing it to minutes/hours of volume and refilling often.
- **Just-in-time:** swap the exact USDC → MANA right before each purchase → zero standing MANA, ~zero risk,
  but **2 on-chain steps per purchase** (slower). Truly atomic JIT (swap + fund + `useCredits` in one tx)
  requires **Option A** + a small orchestrator contract (new audit).

With **Option B** (buyer is `_sender`), funding can't be bundled into the buyer's tx → use the working balance.

**Who makes the on-chain call?** Buying *always* involves a contract call (`useCredits` → `accept`). The
credit is bound to the caller (`_sender`, verified: `keccak256(abi.encode(_sender, chainId, this, credit))`),
and the contract supports meta-transactions. Two valid ways — both one-click and gasless for the buyer:

- **B (default) — buyer's embedded wallet:** the credit is signed for the buyer; their embedded wallet
  (Magic/Privy) auto-signs a meta-tx invisibly; our relayer submits it via `executeMetaTransaction` and pays
  gas. On-chain actor = the buyer. The call can originate from the frontend (embedded SDK, no popup).
- **A — backend relayer:** the credit is signed for our relayer, which calls `useCredits`; the NFT still
  goes to the buyer's `beneficiary`. The buyer's wallet isn't in the tx (pure custodial, Robux-style).

The buyer never opens a wallet popup, holds MANA, or pays gas — that's the UX. But a contract call *does*
happen; it's just made for them.

> Reusing an already-audited money contract keeps audit risk low. Only new on-chain code (e.g. atomic
> refunds) would need an audit — deferred past v1.

---

## 8. Creator flow

1. **Create** the collection in Builder (on-chain Polygon, as today).
2. **List** priced in **Credits** — sign one gasless off-chain trade denominated in `USD_PEGGED_MANA`.
   In the Shop, **primary sales go through the offchain contract too** (deprecate CollectionStore for new
   listings) so all liquidity is one contract + one currency.
3. **Earn:** on each sale the creator receives **MANA** (price − fee; royalties on secondary). Shown as
   Credits/USD for consistency, MANA visible to the creator as a "pro" detail.
4. **Cash out or hold:** withdraw to fiat (Stripe stablecoin payout: MANA → USDC → fiat) or hold MANA.
   **Lower withdrawal fee if they hold/stake** → less sell pressure → better net MANA demand.

---

## 9. Migration tool — "bring your listings to the Shop"

When a seller logs into the Shop:

1. By wallet, fetch their **open listings** from `marketplace-server` (offchain trades priced in MANA,
   and legacy on-chain orders).
2. Offer to **re-express them at a fixed price in Credits (USD)** — pre-fill using the current
   MANA→USD oracle rate; let the seller edit each price.
3. For each accepted item: build the **new USD-pegged trade** on the current offchain contract and have
   them **sign it (gasless)**, and **cancel the old listing** (offchain: sign a signature cancel; legacy
   on-chain: a cancel tx with gas) so it isn't double-listed.
4. Result: their liquidity is now in the Shop, priced in fixed Credits.

> Offchain→offchain (re-price) is cheap and gasless. Legacy on-chain migration is heavier (needs an
> on-chain cancel) — and LAND/estates stay in the legacy marketplace anyway (see scope).

---

## 10. Scope

- **In the Shop:** wearables & emotes (Polygon collections). NAME **secondary** trading is a candidate
  (offchain Ethereum also supports USD-pegged) — TBD.
- **Stays in the legacy marketplace:** LAND, estates, and **NAME registration** (L1, MANA-fixed via
  DCLController). High-value / low-volume / different UX.

---

## 11. Risks & open decisions

| Topic | Note |
| --- | --- |
| **Custodial credits (legal)** | Prepaid stored value → regulatory. T&C: non-refundable, not cashable (Robux-style). Legal review before launch. |
| **Card chargebacks** | Card is reversible, on-chain settlement is not. Buy credits → spend → chargeback = we lose money + NFT already delivered. Needs Stripe Radar, per-account limits, holds, velocity checks. |
| **Oracle vs DEX spread + gas** | Small spread between the Chainlink price the contract uses and the DEX fill; covered by a buffer / the fee margin. Per-trade swaps are fine at wearable/emote sizes; batch only if volume demands. |
| **MANA liquidity depth** | Fine for wearable/emote amounts; not an issue since LAND stays legacy. |
| **"Credits" naming collision** | DCL already markets promo "Credits" (MANA-denominated, seasonal). Decide: extend that system to USD, or rebrand the new currency. |
| **MANA sink strength** | No burn for now → net demand is soft (retained fees + holders). Revisit burn if MANA support becomes a priority. |
| **Two-token clarity** | Consider making it explicit: **Credits** for buyers (stable, USD), **MANA** for the economy/creators (utility, volatile) — the Roblox Robux/DevEx split. |

---

## 12. What we reuse vs build

- **Reuse:** offchain marketplace contract (V4) · `CreditsManagerPolygon` (settlement) · `marketplace-server`
  (catalog/trades, add USD_PEGGED support) · `credits-server` (extend to a USD ledger + per-purchase signing).
- **Build new:** the Shop frontend (the new UX) · a treasury/payments service (Stripe + USDC custody +
  USDC→MANA swap) · the migration tool.
- **Do NOT build:** a new marketplace contract, a new chain, a MANA-backed stablecoin.

---

## 13. Decision log

### The 4 big decisions

| # | Decision | Why |
| --- | --- | --- |
| **D1** | **Credits are pegged to USD** (e.g. 1 credit = $0.10), never to MANA | Only a stable peg gives Roblox-style fixed prices. Pegging to MANA makes the fiat price of a credit float (`$10 = 100 credits today, 200 tomorrow`). |
| **D2** | **Settle in MANA, reusing the audited `CreditsManagerPolygon`** — no new marketplace contract | Keeps MANA's utility, reuses audited code + existing liquidity, keeps audit risk low. |
| **D3** | **Buyer purchase = Option B** — buyer's embedded wallet (Magic/thirdweb) auto-signs a meta-tx, our relayer submits it + pays gas | Already how Magic works today; buyer is the on-chain actor (cleaner accounting/anti-abuse); one-click, no popup, no gas. |
| **D4** | **Funding = async refill of a small MANA working balance** in the CreditsManager (swap USDC→MANA off the buy path) | Purchase stays fast (spends MANA already in the contract). Trade-off: a small, bounded float-price risk on the buffer, kept tiny by sizing + refilling often. |

### Supporting decisions

| Decision | Why |
| --- | --- |
| Backing = **USDC** (dollars), convert to MANA only at/around settle | No FX risk on the balance; the item's cost self-balances at the oracle price. |
| Items priced in USD via `ASSET_TYPE_USD_PEGGED_MANA` on the offchain contract | The contract already supports it — stable display, MANA settlement. |
| Auth = **decentraland-connect** (Magic + thirdweb + MetaMask) + SSO | Already built & configured. Mass adoption uses Magic/thirdweb; OG use MetaMask (they sign normally). |
| Payments = **Stripe** (Bridge is its stablecoin engine, inside) | Card acquiring + USDC in a single integration. |
| Frontend = React + Vite + decentraland-ui2 + decentraland-dapps, **React Query (server state) + Zustand (cart/UI)** — no sagas | Performance + far less boilerplate; heavy orchestration lives in the backend. |
| Backend = **extend** marketplace-server (USD catalog) + credits-server (USD ledger) + **new shop-server** (Stripe, USDC custody, USDC→MANA swap, settlement) on WKC | Reuse, don't rebuild. |
| Scope = **wearables + emotes**; LAND, estates, NAME registration stay legacy | Focus; L1/MANA-fixed flows are different. |
| MANA sink = **retain fees in MANA** (no burn for now) | Soft price support; revisit burn later if needed. |
| Migration = re-price old listings to Credits (**sign new + cancel old**) | Bring existing liquidity into the Shop. |
| Test everything on **Amoy** first | Contracts (offchain V4, CreditsManager, mock MANA/USD aggregator) are deployed there. Swap must be mocked on testnet (no real MANA/USDC DEX). |

### Open (do not block starting)

Legal (custodial, non-refundable credits) · card chargeback/fraud controls · credit unit + pack prices ·
Amoy swap mock · "Credits" naming collision with the existing promo credits.

