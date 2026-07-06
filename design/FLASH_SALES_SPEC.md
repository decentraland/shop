# Flash Sales — spec

Time-boxed, discounted listings with urgency cues (SALE −X% badge + live countdown). A merchandising
lever to lift conversion and AOV, built entirely on the offchain-marketplace contract primitives we
already sign for regular listings — no new contract, no governance change.

## Model

A **flash sale** is a normal USD-pegged **primary** listing signed at a lower price, with a time
window and (optionally) a capped quantity. It reuses the trade `Checks` we already set:

| Concept        | Trade field           | Notes                                                        |
| -------------- | --------------------- | ----------------------------------------------------------- |
| Sale price     | `received[0].amount`  | USD-pegged wei → whole credits (Model B, ceil). The charge. |
| Sale starts    | `checks.effective`    | Unix seconds. `Date.now()` today; a start date for a scheduled sale. |
| Sale ends      | `checks.expiration`   | Unix seconds. The countdown's target.                       |
| Quantity cap   | `checks.uses`         | Units this listing may mint (defaults to remaining supply). |

**Compare-at (the struck-through "was" price)** is the item's *regular* listing price. A flash sale
does **not** replace the base listing — it's an additional, cheaper, time-boxed trade on the same
primary item. When both exist, the shop catalog resolves the item as on-sale:

- `priceCredits`   = the active sale trade's price (the lower one)
- `compareAtCredits` = the base (non-time-boxed) trade's price
- `saleEndsAt`     = the sale trade's `expiration`

If there's no base trade (creator only ever listed the item at the sale price), there's no compare-at
— the item just carries a `saleEndsAt` and renders a countdown without a "−X%". That's valid.

## Cross-repo plan (incremental PRs)

**PR 1 — shop rendering foundation (this PR).** Pure + inert until the catalog sends the fields, so
it's safe to land first.
- `lib/sale.ts` — `isSaleActive`, `saleDiscountPct` (clamped 1..99), `saleTimeLeft`, `formatCountdown`
  ("2d 4h" → "45s"), `countdownTickMs` (self-adjusting repaint cadence). Fully unit-tested.
- `components/SaleCountdown.tsx` — live label; ticks per-minute far out, per-second in the final hour;
  renders nothing for an open-ended or finished sale.
- `CatalogItem.compareAtCredits?` + `saleEndsAt?` (epoch **ms**). `ShopListingRaw` carries them
  (`saleEndsAt` as unix **seconds**); the mapper converts s→ms and drops a compare-at that doesn't
  beat the price (no phantom discount).
- `AssetCard` (grid) + `ItemDetail` (detail): SALE −X% badge, struck-through compare-at, countdown.
  Guarded off for market (fluctuating-price) cards.

**PR 2 — marketplace-server `/v3/catalog/shop` exposes sale state.** Per item, detect a live
lower-price time-boxed trade and return `compareAtCredits` + `saleEndsAt` (expiration seconds)
alongside `priceCredits`. Also accept a `onSale=true` filter and a `saleEndsAt` sort for the Deals
surfaces. Integration test with a real `mv_trades` fixture (closes the shop-catalog test-with-DB gap).

**PR 3 — creator "Put on sale" UI.** In My Assets / Sell: sale price + start/end window + quantity →
sign a discounted primary listing (`createUsdPeggedPrimaryListing` already takes `uses`; extend
`effective` to accept a start date for scheduled sales). Track `Shop Started/Listed Sale`.

**PR 4 — merchandising surfaces.** "On sale now" row on Overview + a Deals filter on Assets, ordered
by soonest-ending. Optional "only N left" scarcity from `available`/`uses`.

## Compare-at derivation — DECISION PENDING

The one fork that determines PR 2's whole architecture in marketplace-server: where does the
struck-through "was" price come from? Three candidates, saved here to revisit later.

### Option 1 — Stored compare-at + window (RECOMMENDED)
The on-chain trade is a single normal listing signed directly at the **sale price** with a short
`expiration` window. "Put on sale" also writes a row to a small marketplace-server table
`shop_sales(trade_id | item, original_price_credits, sale_ends_at)`. The catalog LEFT JOINs it and
exposes `compareAtCredits`/`saleEndsAt`.
- ✅ One clean card, exact control of the "was", no change to existing browse semantics.
- ✅ Uses the contract exactly like any listing (one signed trade), no governance.
- ➖ Cost: 1 migration + 1 write endpoint. Compare-at is off-chain/display-only (fine — it's marketing,
  like Shopify's `compare_at_price`; the buyer always pays the real signed price).

### Option 2 — Dual-listing derive
A flash sale is a **second, cheaper, time-boxed** trade alongside the untouched base listing. The
catalog groups primaries by item: cheapest = sale price, next-higher = `compareAtCredits`,
`saleEndsAt` = the sale trade's expiration.
- ✅ No new table / write path.
- ➖ Two buyable trades per item; the catalog must **dedup per item** (a behavior change to browse);
  heavier query; a deep link could still buy the base at full price.

### Option 3 — Contract coupon (native, deferred)
Base listing stays at full price; a `CollectionDiscountCoupon` + `acceptWithCoupon` applies the % off,
enforced **on-chain**. The "right" mechanism for targeted/promo-code/trustless discounts.
- ➖ Partly **blocked**: buy-with-credits (`CreditsManager.useCredits`) must whitelist the
  `acceptWithCoupon` selector → **governance**; and the **squid doesn't index coupons**, so the
  catalog can't read the rate to render "−X%". Bigger + external deps. Overkill for "creator lowers
  their own price for 48h". Keep for a future promo-codes / targeted-discounts feature.

**Leaning: Option 1.** Coupons (3) parked as a later evolution.

## Other decisions

- Sale price still settles in MANA under the hood at checkout (unchanged) — the discount is purely on
  the signed USD-pegged amount. Treasury/credits flows are untouched.
- No web3 terms in any sale copy (SALE / ends in / was — never "signature", "gas", "mint").
