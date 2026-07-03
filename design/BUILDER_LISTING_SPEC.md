# Builder Listing Spec — Creator Primary Sales for the Shop (T4)

> **Status: research (READ-ONLY).** How a creator lists collection items for **primary sale**
> today (Builder + builder-server + offchain marketplace), and the minimal path for the Shop to
> replicate it as a **USD-pegged primary listing** buyable with credits.
>
> Companion docs: `VISION.md` §8 (creator flow), `CREDITS_CANONICAL_MODEL.md`, `BACKLOG.md` T4.
> All `file:line` citations are into the sibling repos under `/Users/juanma/Projects/dcl/`.

---

## TL;DR (the answer)

**The modern primary-listing path is an offchain `public_item_order` trade — NOT the CollectionStore.**
A creator lists a collection item by signing an EIP-712 trade whose **`sent` asset is a
`COLLECTION_ITEM`** (assetType 4 = mint) and whose **`received` asset is the price**, then POSTing it
to `marketplace-server` `POST /v1/trades`. When a buyer accepts it, the offchain contract calls
`collection.issueTokens(...)` — a **mint** (primary), not a transfer.

- The **only change the Shop needs** vs. its existing secondary flow (`lib/trades.ts`
  `createUsdPeggedListing`) is: swap `sent` from `ERC721` → `COLLECTION_ITEM`, and set
  `type = PUBLIC_ITEM_ORDER`. Everything else (USD-pegged `received`, EIP-712 domain/types, seconds
  gotcha, POST target) is identical.
- The **received asset can be `USD_PEGGED_MANA`** — both the contract and marketplace-server already
  accept it for item orders. So a **USD-pegged primary listing is buyable with credits today**
  (CreditsManager `primarySalesAllowed=true`, assetType 4 supported).
- **builder-server** is needed only to **enumerate a creator's publishable items** and to give the
  Shop the two on-chain identifiers a trade needs: `contract_address` (collection) + `blockchain_item_id`
  (the itemId). Listing itself does **not** POST to builder-server.
- **On-chain prerequisite:** the collection must be **published on-chain** and the offchain marketplace
  must be a **minter** of the collection (`setMinters([OffChainMarketplaceV2],[true])`), signed once by
  the creator. The trade signature alone does not grant mint rights.

---

## 1. builder-server API surface

Base path prefix is `/v1` (`API_VERSION = env.get('API_VERSION','v1')`,
`builder-server/src/server.ts:33`). All routes below are relative to `${BUILDER_SERVER_URL}/v1`.

### 1.1 Auth model — ADR-44 signed fetch

- Requests are authenticated with **AuthChain headers** (`@dcl/crypto` +
  `@dcl/platform-crypto-middleware`), the same identity the Shop already builds in `lib/auth.ts`.
- Headers: `x-identity-auth-chain-0`, `x-identity-auth-chain-1`, … each a JSON-serialized `AuthLink`
  (`builder-server/src/middleware/authentication.ts:12-37`). Verified with a 30-minute expiration
  (`authentication.ts:78-86`); resolves `req.auth.ethAddress` lowercased (`authentication.ts:117`).
- Middleware: `withAuthentication` (strict, 401 if missing) and `withPermissiveAuthentication`
  (allows anonymous) — `authentication.ts:145-148`.
- **The Shop already has everything needed:** `session.identity` (`AuthIdentity`) in `lib/auth.ts:32-46`.
  Use `decentraland-crypto-fetch` / `@dcl/crypto` `Authenticator.signPayload`, or reuse
  decentraland-dapps' `BaseAPI`/`signedFetch`, to attach these headers. (The Shop's `postTrade` already
  drives auth-chain headers via `TradeService`; the same identity works against builder-server.)

> **Gotcha:** the address-scoped routes require the **authenticated address == the path `:address`**
> (see below). The Shop must sign as the connected creator's wallet.

### 1.2 Fetch a creator's collections

```
GET /v1/:address/collections
```
- `builder-server/src/Collection/Collection.router.ts:117-123`; handler
  `getAddressCollections` at `:345-398`.
- **Auth required — enforced in the handler**: throws 401 unless `eth_address === auth_address`
  (`Collection.router.ts:353-359`). (The `withPermissiveAuthentication` on the route is commented,
  but the equality check is hard-coded.)
- Query params: `page`, `limit`, `is_published` (`"true"`/`"false"`), `sort` (`CollectionSort`),
  `q`, `type` (`"standard"|"third_party"`).
- Response: `PaginatedResponse<FullCollection>` (or array). `FullCollection` =
  `CollectionAttributes` + `{ urn, isProgrammatic? }` (`Collection.types.ts:43-49`).

**`CollectionAttributes`** (`Collection.types.ts:4-29`) — fields the Shop cares about:

| field | meaning |
|---|---|
| `id` | collection UUID (builder id) |
| `name` | display name |
| `eth_address` | creator/owner address |
| `contract_address` | **the on-chain collection address** (null until published) — needed for the trade's `sent.contractAddress` |
| `is_published` | published on-chain (or pending) |
| `is_approved` | approved by the curation committee |
| `minters` | addresses allowed to mint (see prereq §4 — must include OffChainMarketplaceV2) |
| `salt` | deterministic-deploy salt |

For a Shop "publish to Shop" list, filter `is_published === true` (contract_address non-null).

### 1.3 Fetch the items in a collection (+ publish/on-sale status)

```
GET /v1/collections/:id/items
```
- `Item.router.ts:150-156`; handler at `:369-422`. `id` = collection UUID (not the contract address).
- Query params: `page`, `limit`, `status` (curation), `synced`, `name`, `mappingStatus`.
- Access via `isAdminUser()` or `hasCollectionAccess()` (`Item.router.ts:413-422`).
- Response: `PaginatedResponse<FullItem>`.

**Alt: all items owned by a creator**
```
GET /v1/:address/items?collectionId=<uuid>
```
- `Item.router.ts:122-128`; requires `auth_address === :address` (`Item.router.ts:264-270`).

### 1.4 Item detail

```
GET /v1/items/:id
```
- `Item.router.ts:133-139`; returns a single `FullItem`; access via `hasPublicAccess()` (`:340-346`).

**`FullItem`** = `ItemAttributes` + computed fields (`Item.types.ts:54-66`, `:15-46`). The fields the
Shop needs to build a primary trade + render a card:

| field | source / meaning |
|---|---|
| `id` | item UUID (builder id) |
| `collection_id` | parent collection UUID |
| `contract_address`¹ | on-chain collection address (from parent collection) |
| **`blockchain_item_id`** | **the on-chain item index (`"0"`,`"1"`,…) = the trade's `sent.itemId`.** Null until published; populated from the subgraph (`Bridge.ts:412`, from `ItemFragment.blockchainId`, `fragments.ts:7`) |
| `is_published` | `blockchain_item_id` set OR curation exists (`Bridge.ts:407`) |
| `is_approved` | on-chain collection approved by committee (`Bridge.ts:408`) |
| `total_supply` | already minted (`Bridge.ts:413`) — remaining = maxSupply(rarity) − total_supply |
| `price` | current on-chain primary price in **MANA wei**, or null (`Bridge.ts:410`) — legacy CollectionStore price; the Shop will set its own USD price instead |
| `beneficiary` | on-chain sale beneficiary (`Bridge.ts:411`) |
| `rarity` | `common…mythic` → determines max supply |
| `type` | `"wearable"` \| `"emote"` |
| `name`, `description`, `thumbnail`, `video?` | display |
| `data` | `WearableData \| SmartWearableData \| EmoteData` (category, etc.) |
| `urn` | full URN (published items) |

¹ `contract_address` is on `ItemAttributes` for published DCL items; if absent on the item payload,
read it from the parent collection (§1.2).

**Publishability rule for the Shop's "My Assets → publish" list:** an item is a valid primary-listing
candidate when `is_published === true` **and** `is_approved === true` **and**
`blockchain_item_id != null` **and** `total_supply < maxSupply(rarity)`.

### 1.5 Publish flow on the server side (context — the Shop does NOT drive this)

Publishing a collection on-chain is a **Builder-only** flow; the Shop should assume the creator already
did it. For completeness:

- Client deploys on-chain (see §2.1), then calls `POST /v1/collections/:id/publish`
  (`Collection.router.ts:139-145`). The server reads the subgraph
  (`collectionAPI.fetchItemsByContractAddress`, `Collection.service.ts:124-147`), **matches DB items to
  on-chain items by index**, and writes `blockchain_item_id` per item (`Collection.service.ts:131-147`).
  This is how `blockchain_item_id` becomes available to the API in §1.4.
- The deterministic `contract_address` is computed at collection upsert
  (`Collection.service.ts:379-399`, `FactoryCollection.ts:13-45`) — available before deploy.
- **No builder-server call sets a "USD sale price."** Prices/sales live either on the CollectionStore
  (legacy) or as offchain trades (modern) — see §2.

---

## 2. How primary listing works today (end-to-end)

There are **two paths**, chosen in the Builder by a feature flag. The decision is made in
`builder/src/components/Modals/SellCollectionModal/SellCollectionModal.tsx:12-18`
(`getIsOffchainPublicItemOrdersEnabled`, `builder/src/modules/features/selectors.ts:69-74`,
flag `FeatureName.OFFCHAIN_PUBLIC_ITEM_ORDERS`).

### 2.1 Prerequisite for both paths — publish + grant minter (on-chain, once)

1. **Publish the collection** (deploy ERC721CollectionV2): `CollectionManager.createCollection(...)`
   via `builder/src/modules/collection/sagas.ts:439-458,633`. Args: forwarder, factory, salt, name,
   symbol, baseURI, creator, items.
2. **Grant the sale contract mint rights** on the deployed collection:
   `ERC721CollectionV2.setMinters(addresses, values)`
   (`builder/src/modules/collection/sagas.ts:674-675`).
   - Legacy: `addresses = [CollectionStore]` (`utils.ts:19-22,50-52`).
   - **Modern: `addresses = [OffChainMarketplaceV2]`, `values = [true]`** (`utils.ts:24-27,58-60`,
     `enableSaleOffchain`). This is what makes offchain minting work.

### 2.2 Path A — legacy CollectionStore (deprecated for the Shop)

- Enabling sale = `setMinters([CollectionStore],[true])` (above). Prices are set/served by the
  CollectionStore off to the side (historically not signed as trades).
- **Buy (primary):** marketplace calls `CollectionStore.buy([[contractAddress,[itemId],[price],[buyer]]])`
  (`marketplace/webapp/src/modules/item/sagas.ts:234-238`). This is the branch taken when the item has
  **no `tradeId`**.
- **The Shop should NOT use this path** (not credit-buyable via the offchain contract, MANA-fixed price).

### 2.3 Path B — offchain `public_item_order` (THE MODERN PATH — use this)

**Listing (creator side), Builder:**
- `builder/src/components/Modals/PutForSaleOffchainModal/PutForSaleOffchainModal.tsx:30-54` →
  `builder/src/modules/item/sagas.ts:219-229` (`handleCreateItemOrderTradeRequest`) →
  `builder/src/modules/item/utils.ts:1027-1081` (`createItemOrderTrade`).
- The trade it builds (`utils.ts:1046-1078`):
  - `type: TradeType.PUBLIC_ITEM_ORDER`
  - `checks.uses = maxSupply(item) - (item.totalSupply||0)` (`utils.ts:1052`) — one signed listing
    mints up to the remaining supply.
  - `sent[0] = { assetType: COLLECTION_ITEM, contractAddress: collection.contractAddress, itemId: item.tokenId, extra: '' }` (`utils.ts:1061-1067`).
    Here **`item.tokenId` is the `blockchain_item_id`** (the on-chain item index).
  - `received[0] = { assetType: ERC20, contractAddress: MANA, amount: priceInWei, beneficiary, extra: '' }`
    (`utils.ts:1069-1077`). ← **The Shop replaces this with `USD_PEGGED_MANA`.**
  - Signed via `getTradeSignature` (decentraland-dapps `lib/trades.ts:127-145`) and POSTed via
    `TradeService.addTrade` → `POST /v1/trades`.

**Buy (buyer side), marketplace:**
- If the item has a `tradeId`, marketplace fetches the trade and calls
  `OffChainMarketplaceV2.accept([trade])` (`marketplace/webapp/src/modules/item/sagas.ts:228-231`,
  `utils/trades.ts:171`). Detection of "primary vs secondary" is purely
  `item.isOnSale && item.available > 0` + presence of `tradeId`
  (`marketplace/.../ItemSaleActions.tsx:15`, `sagas.ts:218,228`).

**On-chain mint mechanic (the crux):**
- `offchain-marketplace-contract/src/marketplace/DecentralandMarketplacePolygon.sol`:
  `_transferAsset` routes `ASSET_TYPE_COLLECTION_ITEM` → `_transferERC721CollectionItem`
  (`:198-199`), which calls `collection.issueTokens([beneficiary],[itemId])` (`:248-267`) — **a mint**.
- **Creator check (`:253-259`):** `require(creator == _signer || creator == _caller)`. For a public
  item order the **signer is the creator**, so any buyer can accept → valid. (This is why the Shop's
  listing must be signed by the collection creator.)
- **Fees:** minting a collection item always pays the fee collector (`:158-161`), no royalties on
  primary — matches VISION §5 (net demand ≈ retained fee).
- **USD-pegged conversion:** `_updateERC20sWithFees` converts `ASSET_TYPE_USD_PEGGED_MANA` to MANA at
  the `manaUsdAggregator` oracle rate at execution (`:167-187`) — the same mechanism the Shop already
  relies on for secondary listings.

**Marketplace-server acceptance of the trade:**
- `POST /v1/trades` handler validates the auth signer (`marketplace-server/src/controllers/handlers/trades-handler.ts:52-66`)
  and the app intent (`dcl:create-trade`; app signer ∈ `['dcl:marketplace','dcl:builder']`).
- `validateTradeByType` for `PUBLIC_ITEM_ORDER` requires **exactly one `sent` `COLLECTION_ITEM`** and
  **exactly one `received` price asset**, where "price asset" is **`ERC20` OR `USD_PEGGED_MANA`**
  (`marketplace-server/src/ports/trades/utils.ts:50-51,134-154`). It rejects duplicates
  (`DuplicateItemOrderError`) if an open item order already exists for the same `contractAddress+itemId`.
- **So a USD-pegged `public_item_order` is accepted by the server as-is** — no server change needed.

---

## 3. What the Shop must do (the exact USD-pegged primary trade)

The Shop's `lib/trades.ts` already signs a USD-pegged **secondary** listing
(`createUsdPeggedListing`, `PUBLIC_NFT_ORDER`, `sent = ERC721`). The **primary** analog is a tiny
delta. Add a `createUsdPeggedPrimaryListing` (do not modify existing; this spec is read-only):

```ts
// Delta vs createUsdPeggedListing:
//   type:            PUBLIC_NFT_ORDER      → PUBLIC_ITEM_ORDER
//   sent[0].assetType: ERC721 (tokenId)    → COLLECTION_ITEM (itemId = blockchain_item_id)
//   sent[0].contractAddress:               = collection.contract_address (from builder-server)
//   checks.uses:     1                     → remaining supply (maxSupply(rarity) - total_supply), or 1
// Everything else identical: USD_PEGGED_MANA received, EIP-712 domain/types, SECONDS conversion, POST.

const tradeToSign: Omit<TradeCreation, 'signature'> = {
  signer: creator,                 // MUST be the collection creator (contract check §2.3)
  network: Network.MATIC,
  chainId,                         // Amoy 80002 for testnet
  type: TradeType.PUBLIC_ITEM_ORDER,
  checks: {
    uses: remainingSupply,         // maxSupply(rarity) - total_supply  (or 1 for single mint)
    expiration: expiresAtMs,       // ms in the object; SECONDS when signed (see gotcha)
    effective: Date.now(),         // ms in the object; SECONDS when signed
    salt: hexlify(randomBytes(32)),
    contractSignatureIndex,        // read from contract
    signerSignatureIndex,          // read from contract for `creator`
    allowedRoot: '0x',
    externalChecks: []
  },
  sent: [{
    assetType: TradeAssetType.COLLECTION_ITEM,
    contractAddress: collection.contract_address,   // on-chain collection addr (builder-server §1.2)
    itemId: item.blockchain_item_id,                // the on-chain item index (builder-server §1.4)
    extra: ''
  }],
  received: [{
    assetType: TradeAssetType.USD_PEGGED_MANA,
    contractAddress: mana.address,
    amount: parseEther(String(usdPrice)).toString(),  // USD value scaled 1e18
    extra: '',
    beneficiary: creator            // creator receives MANA (price − fee)
  }]
}
```

**Signing** — reuse the Shop's own `generateTradeValues` + `OFFCHAIN_MARKETPLACE_TYPES` + domain
(`shop/app/src/lib/trades.ts:35-103,216-223`). The Shop's `valueForAsset` **already** returns
`asset.itemId` for `COLLECTION_ITEM` and `asset.amount` for `USD_PEGGED_MANA`
(`lib/trades.ts:15-32`), so no change to the value extractor is needed. Domain:
`{ name, version } = getContract(OffChainMarketplaceV2, chainId)`,
`salt = hexZeroPad(hexlify(chainId), 32)`, `verifyingContract = market.address`.

> decentraland-dapps' own `getValueForTradeAsset` handles `ERC721/COLLECTION_ITEM/ERC20` but **not
> `USD_PEGGED_MANA`** (`decentraland-dapps/src/lib/trades.ts:58-70`) — which is exactly why the Shop
> forked the signing path. The Shop's fork already covers both `COLLECTION_ITEM` and `USD_PEGGED_MANA`,
> so the primary path needs no new signing code — only the different `type`/`sent` values above.

**POST** — same as secondary: `postTrade(trade, identity)` → `TradeService.addTrade` →
`POST ${marketplaceServerUrl}/v1/trades` (`shop/app/src/lib/api.ts:240-243`). The app signer
`dcl:marketplace` is accepted by the server (§2.3).

**Approval** — unlike secondary ERC721 listings, a primary item order needs **no `setApprovalForAll`**.
Instead the collection must have the OffChainMarketplaceV2 as a **minter** (§4). So the Shop's
`ensureApproval` (`lib/trades.ts:142-157`) is replaced by an "ensure minter" step for primary.

---

## 4. Prereqs / gotchas

1. **Signer must be the collection creator.** Contract enforces `creator == signer || creator == caller`
   (`DecentralandMarketplacePolygon.sol:253-259`). For a public item order the creator signs → OK.
   The Shop must sign the trade with the connected creator's wallet (the same wallet that owns/created
   the collection in builder-server, `Collection.eth_address`).

2. **Collection must grant the offchain marketplace as minter (once, on-chain).** Signing a trade does
   **not** grant mint rights; `issueTokens` requires the caller to be an allowed minter. The creator
   must call `ERC721CollectionV2.setMinters([OffChainMarketplaceV2],[true])`
   (`builder/src/modules/collection/sagas.ts:674-675`, `utils.ts:24-27`). If the creator listed via the
   Builder's offchain flow already, this is done. Otherwise the Shop must offer a one-time "enable Shop
   sales" tx. **Verify** via `Collection.minters` (§1.2) containing the OffChainMarketplaceV2 address, or
   read `isMinter(marketplace)` on-chain.

3. **Collection must be published AND approved.** `is_published && is_approved` and
   `blockchain_item_id != null` (§1.4). Un-approved collections can't be minted from.

4. **SECONDS units gotcha (the one we hit).** `checks.expiration` and `checks.effective` are stored/served
   in **milliseconds** but MUST be **signed in seconds** — the contract checks `block.timestamp`
   (seconds). The Shop's `generateTradeValues` already does `toSeconds(...)` before signing
   (`shop/app/src/lib/trades.ts:11,42-43`); decentraland-dapps does the same via
   `fromMillisecondsToSeconds` (`decentraland-dapps/src/lib/trades.ts:76-77`). **Keep this** for primary
   or on-chain `accept` fails with `NotEffective`/expiration errors. Store ms in the object/DB, sign seconds.

5. **`uses` = remaining supply.** The Builder signs `uses = maxSupply(rarity) - totalSupply`
   (`builder/.../item/utils.ts:1052`) so one listing mints the whole remaining run. The Shop can do the
   same, or `uses: 1` for a single unit. `maxSupply` comes from `Rarity.getMaxSupply(item.rarity)`
   (`builder/.../item/utils.ts:95-99`).

6. **`itemId` is `blockchain_item_id`, not the builder UUID.** The trade needs the on-chain integer index
   (`"0"`,`"1"`,…), i.e. `FullItem.blockchain_item_id` (§1.4). Do **not** use `item.id` (the UUID).

7. **Wearables vs emotes: no difference for the trade.** Both are collection items minted by
   `issueTokens`; `FullItem.type` only affects display/category. Same trade shape for both.

8. **Amoy (testnet) considerations.** `chainId = 80002` (`ChainId.MATIC_AMOY`); marketplace-server treats
   Amoy/Mainnet Polygon as the item-order chains (`marketplace-server/src/ports/trades/utils.ts:58-60`).
   The CreditsManager on Amoy (`0x8052a560e6e6ac86eeb7e711a4497f639b322fb3`) has
   `primarySalesAllowed=true` + assetType 4 support, so the resulting USD-pegged item order is
   credit-buyable end-to-end on Amoy. The `manaUsdAggregator` must be the mocked Amoy aggregator.

9. **Duplicate listings.** marketplace-server rejects a second open `public_item_order` for the same
   `contractAddress+itemId` (`DuplicateItemOrderError`, `utils.ts:142-153`). To re-price, cancel the old
   trade first (signature cancel), like the secondary migration flow in VISION §9.

10. **new_builder does not implement primary sales.** `new_builder/src/builder/api.ts:80-82` only calls
    `POST /collections/{id}/publish`; no price/trade logic. All primary-listing logic to copy lives in
    the legacy `builder` repo.

---

## 5. Recommendation for T4 (minimal Shop implementation)

**Goal:** in *My Assets*, show a creator's publishable collection items and let them create a
USD-pegged **primary** listing that appears in `/assets` as credit-buyable.

**A. Enumerate publishable items (builder-server, signed-fetch with `session.identity`):**
1. `GET ${BUILDER_SERVER_URL}/v1/:address/collections?is_published=true` → creator's on-chain
   collections (`contract_address`, `minters`, `is_approved`) — §1.2.
2. For each, `GET /v1/collections/:id/items` → items with `blockchain_item_id`, `is_published`,
   `is_approved`, `total_supply`, `rarity`, `type`, `name`, `thumbnail`, `price`, `beneficiary` — §1.3/1.4.
3. Filter candidates: `is_published && is_approved && blockchain_item_id != null &&
   total_supply < maxSupply(rarity)`.
4. Add builder-server base URL to `shop/app/src/config.ts` (`VITE_BUILDER_SERVER_URL`), and a signed-fetch
   helper that attaches ADR-44 auth-chain headers from `session.identity` (reuse decentraland-dapps
   `signedFetch`, or the same header construction `TradeService`/`postTrade` already uses).

**B. Ensure the collection can be minted from (prereq check + optional one-time tx):**
- Verify OffChainMarketplaceV2 ∈ `collection.minters` (or on-chain `isMinter`). If not, prompt the
  creator for a one-time `setMinters([OffChainMarketplaceV2],[true])` tx (mirror
  `builder/.../collection/utils.ts:24-27` + `sagas.ts:674-675`).

**C. Sign + POST the USD-pegged primary trade (reuse `lib/trades.ts`):**
- Add `createUsdPeggedPrimaryListing(...)` = `createUsdPeggedListing` with the §3 deltas
  (`type = PUBLIC_ITEM_ORDER`, `sent = COLLECTION_ITEM{contractAddress, itemId = blockchain_item_id}`,
  `uses = remaining supply`). Received stays `USD_PEGGED_MANA` (`amount = parseEther(usd)`),
  `beneficiary = creator`. Keep the seconds conversion.
- `postTrade(trade, session.identity)` → `POST /v1/trades` (`shop/app/src/lib/api.ts:240-243`). No
  server change; the server already accepts USD-pegged item orders (§2.3).

**D. It's now credit-buyable.** The listed item surfaces in the catalog (`fetchListings`) with a
`tradeId`; buyers accept via `OffChainMarketplaceV2.accept` inside `CreditsManager.useCredits` (existing
Shop buy path), which mints via `issueTokens`. No new contract work — CreditsManager already supports
assetType 4 + `primarySalesAllowed=true`.

**Effort:** one builder-server signed-fetch client (reads only) + one trade-builder variant + a minter
prereq check. No marketplace-server change, no contract change. This is the smallest path and it reuses
the Shop's existing signing/POST machinery verbatim.

---

## Appendix — key enums / addresses

- `TradeType`: `BID="bid"`, `PUBLIC_NFT_ORDER="public_nft_order"`,
  `PUBLIC_ITEM_ORDER="public_item_order"` (`@dcl/schemas` `dapps/trade`).
- `TradeAssetType`: `ERC20=1`, `USD_PEGGED_MANA=2`, `ERC721=3`, `COLLECTION_ITEM=4`.
- Offchain marketplace contract name: `ContractName.OffChainMarketplaceV2` (decentraland-transactions).
- Polygon marketplace mint entry: `_transferERC721CollectionItem` → `collection.issueTokens`
  (`DecentralandMarketplacePolygon.sol:248-267`).
- USD→MANA conversion at execution: `_updateERC20sWithFees` /
  `_updateAssetWithConvertedMANAPrice` via `manaUsdAggregator`
  (`DecentralandMarketplacePolygon.sol:167-187`).
- CreditsManager (Amoy): `0x8052a560e6e6ac86eeb7e711a4497f639b322fb3` — `primarySalesAllowed=true`,
  assetType `COLLECTION_ITEM` (4) supported.
