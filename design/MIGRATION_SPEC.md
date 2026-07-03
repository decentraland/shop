# MIGRATION SPEC — MANA (ERC20) listings → USD-pegged (credit-buyable) listings

> **Status: design.** How to convert the classic marketplace's MANA-priced listings into
> USD-pegged listings so they appear in and are buyable in the Shop.
>
> Companion docs: `CREDITS_CANONICAL_MODEL.md` (why USD is the unit), `SELL_INTEGRATION_SPEC.md`
> (secondary `public_nft_order` signing), `BUILDER_LISTING_SPEC.md` (primary `public_item_order`
> signing), `VISION.md`. Tool that implements the read/convert/prepare pipeline:
> `shop/tools/migrate-listings`.

---

## 0. TL;DR

- The Shop's catalog (`marketplace-server` v3 `/v3/catalog/shop`) only returns listings whose
  **received asset_type = 2 (`USD_PEGGED_MANA`)**. Classic listings have received asset_type = 1
  (`ERC20`), so they are invisible and unbuyable in the Shop — even though the item, the seller, and
  the marketplace contract are the same.
- A listing is an **off-chain, EIP-712-signed trade**. You cannot edit its price side from
  `ERC20` to `USD_PEGGED_MANA` — that changes the signed payload, so it needs a **brand-new
  signature from the original seller's wallet**. **A backend job cannot forge that.**
- Therefore migration is **seller-initiated / seller-assisted**: the tool does everything a machine
  *can* do (enumerate, price via the oracle, build the exact `TradeCreation` payloads, dedupe,
  dry-run), and leaves only the **one signature per listing** to the seller — injected as a clear,
  swappable step.
- Chosen UX: **"Move to the Shop" — one approval per batch** (§5). The seller sees a plain-language
  conversion table ("$ price for each item"), approves once, and their items appear in the Shop. Old
  classic listings are cancelled in the same pass (configurable: cancel / keep / keep-then-expire).

---

## 1. What a "listing" actually is (and why price can't be edited in place)

A marketplace listing = a row in `marketplace.trades` (schema `marketplace` in the DAPPS DB) plus
its `marketplace.trade_assets` rows, split by `direction`:

- `sent` = the thing being sold — `ERC721` (a specific token, secondary) or `COLLECTION_ITEM` (a
  mint, primary).
- `received` = the price — `ERC20` (classic MANA) **or** `USD_PEGGED_MANA` (the Shop). This is the
  single column that decides whether a listing is Shop-visible.

The whole trade is covered by one **EIP-712 signature** (`trades.signature`), signed by the seller's
wallet against the `OffChainMarketplaceV2` domain. The signed digest includes the received asset's
`assetType`, `contractAddress`, and `value` (see `shop/app/src/lib/trades.ts:generateTradeValues` +
`OFFCHAIN_MARKETPLACE_TYPES`). Changing `assetType` 1 → 2, or the numeric price, changes the digest
→ the old signature is invalid → the trade is rejected on-chain at `accept()`/`cancelSignature()`.

**Conclusion:** re-listing as USD-pegged = producing a new signed `TradeCreation` and POSTing it to
`marketplace-server /v1/trades`. Only the seller's key can produce the signature. This is the
**KEY CONSTRAINT** the rest of this spec is built around.

### 1.1 What the server accepts without any change

`marketplace-server`'s `validateTradeByType` already accepts a `USD_PEGGED_MANA` received asset for
both `PUBLIC_NFT_ORDER` and `PUBLIC_ITEM_ORDER` (`ports/trades/utils.ts:50-51` —
`isPriceTradeAsset = ERC20 || USD_PEGGED_MANA`). The insert path stores `USD_PEGGED_MANA` amounts in
`trade_assets_erc20` exactly like ERC20 (`ports/trades/queries.ts:72-80`). So **no marketplace-server
change and no contract change is needed** — the migrated listing is a normal, already-supported
trade. The only new artifact is the seller's signature over the USD-priced payload.

---

## 2. Enumeration — finding a seller's / collection's open classic listings

Two source options; the tool supports both (`--source api` default, `--source db`).

### 2.1 Secondary (ERC721, `public_nft_order`) — via the public API (preferred)

```
GET {MARKETPLACE_SERVER_URL}/v1/orders?owner=<seller>&status=open&first=100&skip=0
GET {MARKETPLACE_SERVER_URL}/v1/orders?contractAddress=<collection>&status=open&first=100&skip=0
```

`OrderFilters` supports `owner`, `contractAddress`, `tokenId`, `itemId`, `status`, `network`,
`first`, `skip`, `sortBy` (`@dcl/schemas` `OrderFilters`; parsed in
`marketplace-server/src/controllers/handlers/utils.ts:getOrdersParams`). Each `Order` carries:
`contractAddress`, `tokenId`, `owner` (the seller), `price` (**MANA wei**), `status`, `expiresAt`
(seconds), `network`, `chainId`, `tradeId` (the classic trade to cancel). `tradeId` present means
the order is backed by an off-chain trade — the migratable case.

> `/v1/orders` returns the classic (ERC20) secondary orders. USD-pegged secondary listings surface
> only through the v3 shop feed, so anything with an `Order.price` in MANA and a `tradeId` here is a
> migration candidate (subject to the dedupe check in §7).

### 2.2 Primary (COLLECTION_ITEM, `public_item_order`)

The v1 `/orders` endpoint does **not** index primary item orders (Shop app comment,
`api.ts:fetchTradeForItem`). Enumerate primary classic listings from the DB:

- `getTradesForTypeQuery(TradeType.PUBLIC_ITEM_ORDER)` (`ports/trades/queries.ts:98`) already
  computes `status` (open/sold/cancelled/expired) and joins the item metadata. Filter
  `status='open'`, `signer=<creator>` (and/or the item's `contract_address`), and received
  `asset_type = 1` (ERC20). This yields `{ tradeId, contractAddress, itemId, amount (MANA wei),
  uses, expiresAt, signer }`.
- The tool's `--source db` path runs a scoped read against the DAPPS DB
  (`DAPPS_PG_COMPONENT_PSQL_CONNECTION_STRING`, schema `marketplace` + `squid_marketplace`). It is
  **read-only** — it never writes to the DB. Re-listing always goes through `/v1/trades`.

### 2.3 Scope of a run

A run is scoped by **exactly one of**: `--seller <address>` (all of one wallet's open classic
listings) or `--collection <contractAddress>` (all open classic listings of one collection). A
collection run still groups results by seller, because each seller signs their own items (§5). For a
collection with many sellers, the tool emits one signing bundle per seller.

---

## 3. MANA → USD conversion (the oracle)

Classic listings are priced in **MANA wei**; the Shop prices in **USD wei** (1e18 = $1; the Shop
then shows credits at 1 credit = $0.10). We convert at the **same oracle** the marketplace uses to
settle USD-pegged trades, so a migrated price reflects the item's MANA value at migration time.

### 3.1 Reading the rate

Mirror `shop/app/src/lib/buy.ts:tradeManaPriceWei` (inverted). Read the aggregator address from the
marketplace, then the latest rate:

```
market   = getContract(OffChainMarketplaceV2, chainId)          // decentraland-transactions
aggAddr  = market.manaUsdAggregator()                            // on-chain read
agg.decimals()            → dec        (Amoy mock oracle: 8)
agg.latestRoundData()[1]  → rate       (MANA price in USD, scaled 1e{dec})
```

Amoy mock aggregator: `0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e` (8 decimals). The tool reads the
address from the contract by default and falls back to this constant only if the read fails.

### 3.2 The math (MANA wei → USD wei)

The contract's forward direction (USD → MANA) is `manaWei = usdWei * 10^dec / rate`
(`buy.ts:112`). Migration is the inverse:

```
usdWei = manaWei * rate / 10^dec
```

All BigInt. Example (Amoy mock, dec=8): a 100 MANA listing at rate `0.2696` (`rate = 26960000`):

```
usdWei = 100e18 * 26960000 / 1e8 = 26.96e18  →  $26.96  →  269.6 credits
```

### 3.3 Rounding + price-display policy (deliberate)

The Shop displays whole credits (1 credit = $0.10). To avoid "$26.96 shows as 269 credits but debits
differently" confusion:

- **Round the USD price to the nearest whole credit** by default (`--round credit`, i.e. round
  `usdWei` to the nearest `1e17`). $26.96 → 270 credits → $27.00. Options: `--round none` (exact
  USD), `--round up`/`--round down`.
- Enforce a **minimum price** of 1 credit ($0.10) — a sub-credit MANA dust price would otherwise
  round to 0 and be free. `--min-credits 1` default.
- The oracle read is done **once per run** and stamped into every prepared payload + the report
  (`oracleRate`, `oracleDecimals`, `oracleAt`) for audit. Prices are NOT re-read at sign time — the
  seller approves the exact figures they saw. (If a run sits unsigned for a long time and MANA has
  moved a lot, re-run to re-price; see idempotency §8.)

> This is a **one-time snapshot** conversion, not a peg. After migration the listing is genuinely
> USD-pegged: the Shop/contract re-derives MANA at each purchase from a fresh oracle read. We only
> use the oracle here to pick the *starting* USD number that best matches the seller's old MANA ask.

---

## 4. The KEY CONSTRAINT: the seller signature (stated plainly)

> **A migrated listing needs a new signature from the original seller's wallet. No server, script, or
> admin key can produce it. Migration is therefore always seller-initiated or seller-assisted.**

What the machine can do end-to-end (no seller): enumerate, read the oracle, compute USD prices,
build the **complete unsigned `TradeCreation`** (correct `type`, `sent`, `received=USD_PEGGED_MANA`,
`checks` with fresh `salt`/`signatureIndex`, ms→s handled at sign), dedupe against existing Shop
listings, produce the dry-run table, and later POST the signed payloads.

What only the seller can do: **`_signTypedData(domain, types, values)`** for each new trade, and
`cancelSignature(oldTrade)` for each old one. Both are wallet actions.

The tool encodes this as an **injectable signer**: `prepareMigration()` returns unsigned payloads +
a plan; a `MigrationSigner` interface (`signTrade`, optional `cancelOld`) is the single seam where a
wallet plugs in. `--dry-run` uses a `NullSigner` that signs nothing and just prints. A real run in
the Shop UI injects a wallet-backed signer.

---

## 5. Chosen UX — "Move to the Shop" (least friction)

Surfaced in the Shop's **My Assets / My Listings** view (seller is already connected there).

1. Banner: **"You have N items listed the old way. Move them to the Shop so people can buy them with
   credits."** → button **"Move to the Shop"**.
2. Modal shows the **conversion table** (plain language, no jargon):
   | Item | Old price | New price |
   |---|---|---|
   | Cool Hat #42 | — | **$27.00** (270 credits) |
   | Party Emote | — | **$5.00** (50 credits) |
   Each row has an editable price and a checkbox (default on).
   *(Copy shows only the new $ / credits price. It never shows the old MANA figure or any
   wallet/chain terminology — see the copy rules below.)*
3. Seller clicks **"Move N items"**. The wallet asks them to **approve** — batched to as few
   approvals as possible:
   - **Secondary items:** each needs one listing approval (one signature per token — unavoidable,
     each is a distinct trade). We present them back-to-back with a progress bar
     ("Moving 3 of 8…"), not one modal per item with prose in between.
   - **Primary items (creator's own collection):** one signed `public_item_order` covers the whole
     remaining run of an item (`uses = remaining supply`), so it's one approval per item, and if the
     collection isn't yet enabled for the Shop, a single **"Enable Shop sales"** approval first
     (`setMinters([OffChainMarketplaceV2],[true])`, see `BUILDER_LISTING_SPEC §2.1/4`).
4. Old classic listings are **cancelled** as part of the same flow (default; see §6). Cancels are
   also wallet approvals, so the tool **orders them last** and lets the seller skip them ("keep the
   old ones up for now") if they prefer a safer cutover.
5. Done screen: **"N items are now in the Shop."** Deep-links to each in the Shop grid.

**Why this is the least friction available:** the signature is irreducible (§4), so the only lever is
*how many prompts* and *how much the seller has to understand*. This design (a) auto-computes every
price, (b) batches primary items into one approval each, (c) shows a single plain table instead of
per-item forms, and (d) never asks the seller to think in MANA or credits math. The residual N
signatures for N distinct secondary tokens are inherent to the protocol.

### Alternative UX considered (and why not default)

- **Gasless / meta-tx re-listing:** the *signature* still must be the seller's; a relayer only
  removes the *cancel* gas. Worth adding later for the cancel step, but doesn't remove the core
  approvals. Kept as a future enhancement.
- **Admin bulk re-list:** impossible — no admin key can sign as the seller. Rejected.
- **Auto-migrate on connect:** signing without an explicit "Move to the Shop" click is surprising and
  risks unwanted cancels. Rejected in favor of an explicit action.

---

## 6. Cancel-old vs keep-old

Per-run policy (`--cancel-old <mode>`), default `after-post`:

- **`after-post` (default):** POST the new USD-pegged listing first; only after it's accepted, cancel
  the old ERC20 trade (`marketplace.cancelSignature(oldTrade)`, mirrors
  `shop/app/src/lib/buy.ts:cancelListing`). Guarantees the item is never simultaneously *absent from
  both* surfaces. Brief window where the item is buyable in *both* the classic marketplace (MANA) and
  the Shop (credits) — acceptable, and closed by the cancel.
- **`keep`:** leave the old listing up. Item is buyable in both places indefinitely. Use for a soft
  launch. Risk: double-sell — the same ERC721 can't be sold twice (whichever `accept` lands first
  wins; the other reverts), so it's safe for **secondary** (uses=1). For **primary**, both listings
  draw from the same remaining supply, also safe (mint stops at max supply). The only downside is a
  confusing "sold on the other surface" failure for the losing buyer.
- **`cancel-first`:** cancel the old listing before posting the new one. Safest against double-buy,
  but if the seller abandons mid-flow the item is listed **nowhere** until they finish. Not default.

> **Double-sell safety, precisely:** for secondary, the ERC721 is escrow-free (transfer-on-accept),
> so the first `accept` transfers it and any second `accept` reverts (`ERC721: transfer of token that
> is not own`). For primary, `issueTokens` reverts once `total_supply == maxSupply`. So "keep both"
> never over-delivers; it only risks a late buyer seeing a failed purchase. `after-post` minimizes
> even that.

---

## 7. Dedupe (don't create a second Shop listing for the same item)

Before preparing a payload, check whether a **USD-pegged listing already exists** for the same
target, and skip if so:

- **Secondary:** query the v3 shop feed for the token
  (`/v3/catalog/shop?contractAddress=<c>&...` then match `tokenId`), or the DB `mv_trades` for an
  open `public_nft_order` on that `sent_nft_id` with a `USD_PEGGED_MANA` received asset. If found →
  status `SKIP_ALREADY_USD`.
- **Primary:** `/v3/catalog/shop?contractAddress=<c>&itemId=<i>&first=1` — if a listing comes back,
  the item is already Shop-listed → `SKIP_ALREADY_USD`. This also matches the server's own
  `DuplicateItemOrderError` guard (`ports/trades/utils.ts:142-153`): the server rejects a second open
  `public_item_order` for the same `contractAddress+itemId`, so we must cancel the old MANA item
  order first (`cancel-first` for primary re-price) OR the POST will 4xx. The tool detects an open
  classic `public_item_order` on the same item and, for primary, forces `cancel-first` ordering with
  a warning.

The tool also dedupes **within the run** (same token/item appearing twice) and treats
already-`SKIP_ALREADY_USD` rows as no-ops so re-running is safe (§8).

---

## 8. Idempotency & re-runs

- **Deterministic scope, non-deterministic salt.** Each prepared trade gets a fresh random `salt`
  and reads live `signerSignatureIndex`, so re-preparing produces a *new* unsigned payload — but the
  **dedupe check (§7) makes a re-run a no-op** for anything already migrated. Re-running after a
  partial signing session simply prepares the still-unmigrated remainder.
- **Idempotency key for reporting/state:** `keccak256(chainId | marketplace | sent.assetType |
  sent.contract | (tokenId|itemId) | seller)` — stable per (item, seller, chain), independent of
  price/salt. The tool writes a JSON **run report** (`out/migration-<scope>-<ts>.json`) keyed by
  this so a caller (or the Shop UI) can resume: `PREPARED → SIGNED → POSTED → OLD_CANCELLED`, plus
  `SKIP_ALREADY_USD`, `SKIP_EXPIRED`, `ERROR`.
- **POST idempotency:** the server assigns the tradeId; if a POST is retried and the server already
  has an identical open trade it will either accept (new salt → new trade) or reject on dedupe.
  The tool treats a `Duplicate*OrderError` from the server as `SKIP_ALREADY_USD`, not a failure.
- **Signature-invalidation caveat:** if the seller bumps their global `signerSignatureIndex` (a
  "cancel all listings" action) between prepare and sign, the prepared `checks.signerSignatureIndex`
  is stale and the resulting trade would be inert. The signer step re-reads the index just before
  signing (the trade-builder already reads it live; keep that at sign time, not prepare time, for the
  real wallet path).

---

## 9. Edge cases

| Case | Detection | Handling |
|---|---|---|
| **Already USD-pegged** | v3 feed / `mv_trades` has an open USD listing for the target (§7) | `SKIP_ALREADY_USD` — no payload built. Makes re-runs safe. |
| **Expired classic listing** | `Order.expiresAt`/`trades.expires_at < now` or status computed CANCELLED | `SKIP_EXPIRED` by default. `--include-expired` re-lists with a **fresh** expiration (`--expiration-days`, default 180) instead of copying the dead one. |
| **Cancelled / sold classic** | computed `status` = cancelled/sold | Skipped (not open). Not a migration candidate. |
| **Primary vs secondary** | `sent.assetType`: 3 = ERC721 → `PUBLIC_NFT_ORDER`; 4 = COLLECTION_ITEM → `PUBLIC_ITEM_ORDER` | Different `sent`, `type`, `uses`, and prereq (approval vs minter). Tool branches on it (§10). |
| **Primary duplicate order** | open classic `public_item_order` on same item | Server rejects a 2nd open item order → tool forces `cancel-first` for that item, warns. |
| **Sub-credit price** | `usdWei < 1e17` after conversion | Clamp to `--min-credits` (default 1 credit = $0.10). |
| **Zero / null price** | MANA amount 0 or unreadable | `ERROR` row, skipped — never list for free silently. |
| **Seller ≠ current NFT owner** (secondary) | owner moved the token after listing | Old listing is dead anyway; `accept` would revert. `SKIP_STALE_OWNER` if the NFT API shows a different owner. |
| **Collection not Shop-enabled** (primary) | `isMarketplaceMinter(collection)` false (`trades.ts:245`) | Prepare the listing but flag `NEEDS_MINTER`; the UX inserts the one-time "Enable Shop sales" approval before posting. |
| **ERC721 not approved** (secondary) | `isApprovedForAll(seller, market)` false (`trades.ts:150`) | Classic listing implies it was approved once; if not, the buy would revert. Flag `NEEDS_APPROVAL`; UX inserts one `setApprovalForAll` approval (covers all that collection's tokens at once). |
| **Estate / composable NFT** | `sent.contract` is an Estate | Needs a live `fingerprint` in `sent.extra` (see `trades.ts` `fingerprint` param). Out of scope for v1 (wearables/emotes); `SKIP_UNSUPPORTED`. |
| **Bids (not listings)** | `type = bid` | Not a listing; ignored entirely. Migration only touches `public_nft_order` / `public_item_order`. |
| **Non-MANA ERC20 price** | received `contractAddress` ≠ MANA | Out of scope (marketplace prices in MANA); `SKIP_UNSUPPORTED`. |
| **Cross-chain** | `chainId` mix in one run | Oracle + marketplace are per-chain; the tool groups by chain and reads the oracle per chain. |

---

## 10. The exact prepared payloads (what the tool emits per candidate)

Reuses the Shop's trade shape verbatim (`shop/app/src/lib/trades.ts`).

**Secondary (ERC721 → `PUBLIC_NFT_ORDER`)** — identical to `createUsdPeggedListing`, price from §3:

```
type:  public_nft_order
sent:     [{ assetType: 3 (ERC721),  contractAddress, tokenId, extra: fingerprint||'' }]
received: [{ assetType: 2 (USD_PEGGED_MANA), contractAddress: MANA, amount: usdWei, extra: '', beneficiary: seller }]
checks: { uses: 1, expiration: (fresh|copied)ms, effective: now ms, salt: random32,
          contractSignatureIndex, signerSignatureIndex (live), allowedRoot: '0x', externalChecks: [] }
```

**Primary (COLLECTION_ITEM → `PUBLIC_ITEM_ORDER`)** — identical to `createPrimaryUsdPeggedListing`:

```
type:  public_item_order
sent:     [{ assetType: 4 (COLLECTION_ITEM), contractAddress: collection, itemId: blockchain_item_id, extra: '' }]
received: [{ assetType: 2 (USD_PEGGED_MANA), contractAddress: MANA, amount: usdWei, extra: '', beneficiary: creator }]
checks: { uses: remaining supply (or copied from old uses), ...as above }
```

The payload is returned **unsigned** (`Omit<TradeCreation,'signature'>`) plus the EIP-712 `domain`
and `types` so the injected signer can produce the signature without re-deriving anything. Signing +
POST + cancel-old are performed by the injected `MigrationSigner` (§4); `--dry-run` prints the table
and writes the report, and signs/posts nothing.

---

## 11. Copy rules (Shop-facing, web2-first)

All seller-facing strings avoid: wallet, sign, gas, chain, MANA, mint, token, contract, on-chain,
transaction, USDC, crypto. Use `$` and **credits**.

- "Move to the Shop" / "Move N items" / "Enable Shop sales" / "You have N items listed the old way."
- Prices shown as **"$27.00 (270 credits)"**. Never show the old MANA figure to the seller.
- Approvals surface as a neutral progress step ("Moving 3 of 8…"), not "sign transaction 3 of 8".
- Backend/CLI output (dry-run table, logs, report JSON) may use technical terms (tradeId, oracle,
  MANA wei, assetType) freely — it is operator-facing, not user-facing.

---

## 12. How this maps to the tool (`shop/tools/migrate-listings`)

| Spec section | Code |
|---|---|
| Enumeration (§2) | `src/enumerate.ts` (`fetchOpenErc20Orders` via `/v1/orders`; `--source db` stub for primary) |
| Oracle + math (§3) | `src/oracle.ts` (`readOracle`, `manaWeiToUsdWei`, `roundUsdWei`) |
| Signer seam (§4) | `src/signer.ts` (`MigrationSigner` interface, `NullSigner`, `walletSignerFromEthers` factory) |
| Payload build (§10) | `src/prepare.ts` (`buildUsdPeggedSecondary`, `buildUsdPeggedPrimary` — ported from `shop/app/src/lib/trades.ts`) |
| Dedupe/edge cases (§7,§9) | `src/prepare.ts` (`classifyCandidate`) + `src/shopFeed.ts` (`isAlreadyUsdListed`) |
| Orchestration/report (§5,§6,§8) | `src/migrate.ts` (`prepareMigration`, `runMigration`) |
| CLI + dry-run (§3.3,§11) | `src/cli.ts` (`--dry-run`, `--seller/--collection`, `--round`, `--cancel-old`, …) |
