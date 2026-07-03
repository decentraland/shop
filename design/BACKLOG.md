# The Shop — UI/UX backlog (to pick up later)

Captured 2026-07-02. These are queued after the core buy-with-credits loop. Each has acceptance
criteria + notes. Research specs (from subagents) linked where relevant.

---

## Progress log

Feature groups (from the 2026-07-02 brainstorm), in priority order:

- **Group A — make the existing UI work** ✅ SHIPPED
  - Search (nav → `/assets?q=`, debounced), sidebar filters (category/sub-category/rarity/price),
    functional Sort dropdown, persisted Favorites (localStorage) + `/my-favorites` page.
- **Group B — commerce** (in progress)
  - **B5 Cart → 1 transaction** ✅ SHIPPED — `buyManyWithCredits()` fulfils all same-marketplace
    trades with one `accept([...])` inside a single `useCredits()` (one signature). One ephemeral
    credit per item; settlement stays per-item. Caveat: a very large basket can exceed the hourly
    credited-MANA cap and revert — fine at demo scale. Unit-tested (`src/lib/buy.spec.ts`).
  - **B7 Purchase history** ✅ SHIPPED — `GET /users/:address/purchases` (signed-fetch) + `/my-purchases`
    page (resolves each trade → name/thumb/price, status badges). Shows SETTLED + PENDING, hides EXPIRED.
  - **Intent-cancel** ✅ SHIPPED (supports B5) — `POST /credits/authorize/cancel` releases reserved
    dollars from PENDING intents immediately when a checkout fails, instead of waiting for the TTL.
  - **B6 Cancel listing** ✅ SHIPPED (secondary) — "Remove listing" on an owned on-sale item calls
    `cancelListing()` → `marketplace.cancelSignature(trade)` (mirrors decentraland-dapps TradeService.cancel).
    Also: My Assets cards (owned + created) are now clickable → item detail (WearablePreview), and the
    "Items you created" thumbnails resolve builder filenames → storage URLs (were broken).
  - **My Assets "On sale" split** ✅ SHIPPED — created items are split into an **On sale** block vs
    **ready to publish**, using the v2 catalog's per-item `isOnSale`/`price` (`fetchCollectionSaleState`)
    — the v1 `/orders` endpoint does NOT index primary item orders, but the v2 catalog does.
  - **Listing feedback** ✅ SHIPPED — app-wide toast system (`store/toast.ts` + `<Toaster/>`) + a
    success view in both Sell/PrimaryList modals (checkmark, price, "View in Shop"). Clarified the
    two-confirmation copy: 1st = one-time collection enable (setMinters, on-chain), 2nd = the trade
    signature (free); subsequent items in the same collection are a single step.
  - **B8 Gasless checkout** — deferred to the infra phase (meta-tx + relayer).

- **v3 shop catalog** ✅ SHIPPED — `GET /v3/catalog/shop` on the marketplace-server: a curated feed of
  ONLY credit-buyable (USD-pegged, `trade_assets.asset_type=2`) listings, unified across primary
  (public_item_order) + secondary (public_nft_order), each carrying the **tradeId**, priceCredits,
  name/thumbnail/rarity/category, available. Reads `marketplace.mv_trades` joined to item/nft metadata;
  ~11 curated fields (vs ~26) and one request (no client N+1). New `shop-catalog` port + handler +
  route; `/v2/catalog` untouched (safe for the classic marketplace).
  - Client migrated: `fetchListings`, `fetchCollectionSaleState`, `fetchTradeForItem` now read v3;
    `fetchShopListingForItem` hydrates the item detail on deep-link (route seg = itemId for primary).
  - **This closed both gaps**: buy-primary works (tradeId in the feed → primary items are buyable +
    show in browse) and cancel-primary works (My Assets "On sale" created items now have Remove listing
    via the tradeId). Verified e2e against the live server + a real listed item.

- **Creator profiles** ✅ SHIPPED — `CreatorBadge` (avatar + name via peer `/lambdas/profiles`, short
  address fallback) on the grid cards + item detail. Feed keeps the full address for the lookup.
- **Server-side filters on v3** ✅ SHIPPED — `/v3/catalog/shop` now takes rarity, wearableCategory,
  minPriceCredits/maxPriceCredits, search (name ILIKE), sortBy (newest/cheapest/most_expensive/name).
  Assets.tsx is fully server-driven (keepPreviousData; no more in-memory filtering).
- **Item-detail carousel quick add** ✅ SHIPPED — each "more from this collection" card has a direct
  add-to-cart (+) button for listed siblings (card click still swaps the hero).

  Follow-ups:
  - `mv_trades` freshness: it's a materialized view — confirm the refresh cadence so new listings /
    cancels appear promptly (same concern as the existing catalog).

- **Group D — money rails + infra** (scaffolded by 3 parallel agents, integrated behind flags):
  - **Real Stripe** ✅ SCAFFOLDED + WIRED (flag off) — credits-server `POST /credits/checkout` +
    `POST /credits/webhook` (HMAC-verified, idempotent, mirrors the Apple-IAP precedent) +
    `GET /credits/orders/:id`; a completed payment → `createUsdTopUp`. App delegates to
    `payments-stripe.ts` when `VITE_STRIPE_PK` + a payments host are set; the dev-mint MOCK stays the
    default. Enable via `STRIPE_ENABLED=true` + keys. See STRIPE_SPEC.md / STRIPE_INTEGRATION.md.
    Boot-safe when disabled. Follow-ups: refunds/disputes, shop-server treasury trigger.
  - **Gasless checkout** ✅ SCAFFOLDED + WIRED (flag off) — VERDICT: the deployed CreditsManager
    (Amoy) natively supports meta-tx (`executeMetaTransaction`+`getNonce`) and DCL runs a relayer on
    Amoy — no contract/server change needed. `buy-gasless.ts` (buyer signs off-chain → relayer pays
    fee) wired into ItemDetail + Cart with auto-fallback to buyer-submitted; enable via
    `VITE_GASLESS_CHECKOUT=1`. See GASLESS_SPEC.md / GASLESS_INTEGRATION.md.
  - **Migration tool** ✅ BUILT (standalone CLI) — `shop/tools/migrate-listings`. See MIGRATION_SPEC.md.
  - **Import UI** ✅ SHIPPED — the in-app "Import your listings" flow (`/import`):
    - marketplace-server: `GET /v3/catalog/importable?seller=` returns the seller's OPEN classic
      (ERC20, asset_type=1) listings — primary + secondary — with raw MANA price + oldTradeId.
    - client `lib/import.ts`: reads the oracle once, converts MANA→credits (rounded up, min 1),
      splits into **Your creations** (primary) / **Items you own** (secondary). `importListing()`
      re-lists via the existing sign path (createUsd/PrimaryUsdPeggedListing + ensureApproval/Minter).
    - `/import` page (matches the approved artifact) + `MigrateModal` lists one at a time (a
      confirmation each) with progress → congrats. Editable prices, per-item + "List all", empty
      state ("You're all caught up"). A banner in My Assets links to it when importable > 0.
    - Nomenclature nailed everywhere: **Your creations** (made by you) vs **Items you own** (bought).
    - Decision: keeps the OLD classic listing by default (one confirmation per item = smoother); a
      "remove old" option is a follow-up. To test you need a wallet with open classic (MANA) listings.
  - **Live treasury (#3)** — STILL TODO, lives IN the shop-server (treasury component + scheduled job;
    it already has `POST /treasury/deposits` + get-treasury-status scaffolding): watch USDC → swap
    USDC→MANA on Polygon → refill the CreditsManager → reconcile. Async, off the buy path. The
    per-purchase swap (convert-at-spend) already works; this is the replenishment side.
  - **Bridge (#2) — LIKELY UNNECESSARY.** Stripe's stablecoin financial accounts pay out **USDC
    directly on Polygon** (9 chains incl. Polygon, confirmed 2026), so the treasury can receive USDC
    on Polygon with no cross-chain hop. Across V4 stays only as a fallback if funds ever land on
    another chain. Removes a whole moving part from the original plan.
- **E2E tests** ✅ SHIPPED — `npm run test:e2e` (Puppeteer + vitest). Mock wallet (seeded localStorage
  + injected `window.ethereum`) so login runs the real restore path with no popup/signature; all HTTP
  + JSON-RPC mocked (reads say "already approved"). 9 happy paths across 8 files: publish a creation,
  list an owned item, import old listings, browse + rarity filter, item detail + add-to-cart,
  favorites, buy-with-credits (Buy now → tx via mock wallet → /success), cart checkout. See
  E2E_TESTS.md for the coverage boundary (what's mocked vs real).
- **Group C — discovery/content** — TODO (collection page, creator dashboard, recently-viewed/wishlist).
- **Server-side USD filter** — DONE (v3 catalog replaced the N+1).

Runtime note for B5/B7: verify against the local stack once the `shop-usd-credits` migration is
re-applied (credits-server applies it on startup). The endpoints + batch tx compile + unit-test green.

---

## T1 — Item detail page
**Goal:** a proper product page for a listing, matching Figma.
Figma: https://www.figma.com/design/Z0actRbZof0tDolIdxIL3A/Marketplace-UX-Improvements?node-id=796-64222&m=dev

**Includes:**
- **WearablePreview with the item MOUNTED on your avatar** (as the current marketplace does), beside the item info.
- **Collection carousel** (below): other items from the same creator/collection.
- **Tap an item in the carousel → switch the detail view to that item** (and its preview), so you can browse + add several to the cart without leaving the page.
- Add-to-cart from the detail page.

**Acceptance:** pixel-perfect vs Figma; preview shows the item on the connected user's avatar; carousel loads collection items; switching items updates preview + price + add-to-cart; can add multiple items to cart in one session.

**Notes / research:** see `ITEM_DETAIL_SPEC.md` (design + how the marketplace does the avatar-mounted WearablePreview + collection carousel). Reuse `AssetCard`'s hover-preview provider pattern (CARD_SPEC.md) — ideally a shared-iframe provider so multiple previews don't spawn many iframes.

---

## T2 — Add-to-cart popover (feedback)
**Goal:** tapping "Add to cart" gives immediate feedback.

**Behavior:** on add, **auto-open a cart popover** (dropdown from the cart icon) showing the current cart contents + total + a "Checkout" CTA. Auto-dismiss after a few seconds or on outside-click.

**Acceptance:** adding any item opens the popover with the item visible; badge count updates; popover reachable by clicking the cart icon too; works from grid, item detail, and carousel.

**Notes:** the cart store (`store/cart.ts`) already holds items; this is a presentational popover fed by it. Keep it light (no route change).

---

## T3 — Checkout upsell ("last-minute" items)
**Goal:** increase basket size at checkout.

**Behavior:** in the cart/checkout page, show a **"You might also like"** row of a few more buyable (USD-pegged) items to add last-minute (one-tap add).

**Acceptance:** shows 4–8 relevant items not already in the cart; one-tap add updates the cart + total inline; respects credit-buyable filter.

**Notes:** source from `fetchListings` (USD-pegged open listings). Later: personalize (same collections/creators as cart items).

---

## T4 — My Assets: primary listing for creators (publish to the Shop)
**Goal:** if I'm a creator, list my collection items for **primary sale** in the new Shop.

**Behavior:** in My Assets, besides my owned NFTs (secondary), show **MY collection items I can publish** (primary). Let me create a listing for them in the Shop (USD-priced), so they show in `/assets` as credit-buyable.

**Open question (research):** today this flow lives in the **Builder** (create collection → publish → list). We likely need to call **builder-server** to fetch a creator's collections + publishable items, and replicate the builder's "create listing / put on sale" flow. Figure out the exact APIs + on-chain calls.

**Acceptance:** a creator sees their publishable collection items; can create a USD-pegged primary listing from the Shop; the item then appears in `/assets` and is buyable with credits (the CreditsManager already supports `COLLECTION_ITEM` primary sales — `primarySalesAllowed=true`).

**Notes / research:** see `BUILDER_LISTING_SPEC.md` (how the builder + builder-server publish/list collection items; what to call from the Shop). Recall the offchain marketplace + CreditsManager already handle `ASSET_TYPE_COLLECTION_ITEM` (primary) — so a primary USD-pegged trade of a collection item is buyable with credits.

---

## Deferred (already noted elsewhere)
- Gasless buy (meta-tx + relayer) — buyer signs nothing.
- Intent-cancel endpoint (release reserved credits on client-side checkout failure instead of waiting for the ~15min TTL).
- Migration tool (old MANA listings → USD-pegged).
- Server-side "USD-pegged listings" catalog filter (replace the N+1 `fetchListings`).
- Purchase-history page (`/my-purchases`) from SETTLED `usd_purchase_intents`.
- ui2 code-splitting (~1.9MB chunk), shared-iframe WearablePreview provider.
