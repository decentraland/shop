# Item Detail Page — Porting Spec (backlog T1)

Target stack: **Vite + React + TypeScript + `decentraland-ui2`** (the Shop app at `/Users/juanma/Projects/dcl/shop/app`).

Goal: build a product/detail page for a listing showing:
1. A **WearablePreview mounting the item on the connected user's avatar** (exactly like the current marketplace item page).
2. Item info + price (credits) + **Add to cart** / Buy now beside it.
3. A **collection carousel** below (other items from the same collection); tapping a carousel item swaps the whole detail view (preview, price, add-to-cart) so several can be browsed and added to the cart.

Sources of truth (absolute paths):
- Detail preview (on-avatar): `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/AssetImage/Preview/Preview.tsx`
- Profile → preview wiring: `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/AssetImage/AssetImage.container.ts`
- Collection items API: `/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/vendor/decentraland/item/api.ts`
- Collection fetch saga: `/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/item/sagas.ts` (`handleFetchCollectionItemsRequest`)
- Routes: `/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/routing/locations.ts`
- Figma: file `Z0actRbZof0tDolIdxIL3A` ("Marketplace UX Improvements"), node `796:64222`.
- Shop app: `src/components/AssetCard.tsx`, `src/pages/Assets.tsx`, `src/lib/api.ts`, `src/store/cart.ts`, `src/hooks/useProfile.ts`, `src/store/wallet.ts`, `src/config.ts`, `src/index.css`.
- Companion doc: `/Users/juanma/Projects/dcl/shop/design/CARD_SPEC.md` (the shared-iframe hover-preview provider — reuse for the carousel).

---

## 0. TL;DR (the load-bearing facts)

1. **On-avatar preview = `<WearablePreview>` with `profile={connectedAddress || 'default'}` and `type={PreviewType.AVATAR}`** (for wearables in try-on mode). The marketplace resolves the avatar from `profiles[wallet.address].avatars[0]` and passes `profile={avatar ? avatar.ethAddress : 'default'}`. When `profile` is a real address the iframe fetches that user's published avatar from the catalyst and puts the item **on** it. When there is no connected wallet it falls back to `'default'` (the default DCL avatar).
2. **The default marketplace mode is `PreviewType.WEARABLE` (item alone, spinning), NOT on-avatar.** On-avatar is `PreviewType.AVATAR`, gated behind `isTryingOn`. For the Shop's "show it mounted on the user's avatar" requirement, **default `type` to `PreviewType.AVATAR`** and always feed a real profile when connected (see §1).
3. **Emotes: pass NO `type`** (leave `undefined`) — the preview app auto-detects an emote and plays it on the avatar. Emotes also use `wheelZoom={1.5}` and `wheelStart={100}`.
4. **Addressing:** MATIC/Polygon items → `contractAddress` + `itemId` (mint) or `tokenId` (specific NFT). Ethereum items → `urns: [urn]`. **Never pass `itemId` and `tokenId` together.**
5. **Collection carousel data source:** `GET {marketplaceServerUrl}/v1/items?contractAddress=<collectionAddress>&first=<n>&includeSocialEmotes=false`. This returns the sibling items of the collection (same `contractAddress`).
6. **Switching carousel item = swap route param + refetch trade; keep ONE warm preview iframe.** Do NOT spawn an iframe per carousel card. Reuse the shared-iframe provider pattern from `CARD_SPEC.md`, or (for the main hero preview) keep the iframe URL stable and drive item changes via `postMessage UPDATE` (see §3.3).
7. **Route:** `/item/:contractAddress/:tokenId` for secondary listings (the Shop browses `fetchListings`, keyed by `tradeId`/`tokenId`), with the `tradeId` carried in router state / re-resolved for cart-add. See §4.

---

## 1. On-avatar WearablePreview config (VERBATIM from marketplace)

`Preview.tsx` render block (lines 333–350), copied exactly:

```tsx
<WearablePreview
  id="wearable-preview"
  background={Rarity.getColor(rarity)}
  emote={isTryingOnEnabled || isUnityWearablePreviewEnabled ? previewEmote : undefined}
  hair={hair}
  profile={avatar ? avatar.ethAddress : 'default'}
  skin={skin}
  type={previewType}
  wheelZoom={isEmote ? 1.5 : undefined}
  wheelStart={isEmote ? 100 : undefined}
  onLoad={handleLoad}
  onError={handleError}
  {...wearablePreviewProps}
  dev={config.is(Env.DEVELOPMENT)}
  unityMode={PreviewUnityMode.MARKETPLACE}
  unity={!isSocialEmote && isUnityWearablePreviewEnabled}
  socialEmote={isSocialEmote ? socialEmote : undefined}
/>
```

### How each prop is computed (marketplace)

| Prop | Value / source | Notes |
|---|---|---|
| `id` | `"wearable-preview"` | Stable DOM id so `ZoomControls`/`EmoteControls` and `postMessage` can target the iframe by id. |
| `profile` | `avatar ? avatar.ethAddress : 'default'` | **The key prop.** `avatar` = `profiles[wallet.address].avatars[0]` (redux). Real address → item worn on the connected user's avatar. No wallet → `'default'`. |
| `type` | `previewType` = `undefined` for emotes; else `isTryingOnEnabled ? PreviewType.AVATAR : PreviewType.WEARABLE` (`Preview.tsx:313-317`). | AVATAR = on the avatar; WEARABLE = item alone. |
| `emote` | Wearables only, when trying-on or unity: a random `PreviewEmote.FASHION / FASHION_2 / FASHION_3` pose (`Preview.tsx:175-178`) so the avatar isn't in T-pose. `undefined` otherwise. |
| `skin` / `hair` | `colorToHex(avatar.avatar.skin.color)` / `...hair.color` (`Preview.tsx:106-116`) — overrides the avatar's skin/hair to match the connected user. Only set when `avatar` exists. |
| `background` | `Rarity.getColor(rarity)` where `rarity = asset.data.wearable?.rarity || asset.data.emote?.rarity || Rarity.COMMON`. |
| `wheelZoom` / `wheelStart` | `1.5` / `100` for emotes; `undefined` for wearables. |
| `contractAddress` / `itemId` / `tokenId` / `urns` | from `{...wearablePreviewProps}` — see addressing below. |
| `dev` | `config.is(Env.DEVELOPMENT)`. In the Shop use `config.chainId === 80002` (Amoy) — same as `AssetCard.tsx:53`. |
| `unityMode` | `PreviewUnityMode.MARKETPLACE` (always). |
| `unity` | `!isSocialEmote && isUnityWearablePreviewEnabled` (feature flag). **For the Shop, omit `unity` / leave false** — the Babylon renderer is simpler and matches the hover cards. |
| `socialEmote` | social-emote outcome variant; only for social emotes. **Shop hides social emotes** (`includeSocialEmotes=false`), so leave `undefined`. |
| `onLoad(renderer?)` | `handleLoad` — sets `rendererType`, clears error, clears loading spinner (`Preview.tsx:59-63`). |
| `onError(error)` | `handleError` — logs, sets error, clears spinner (`Preview.tsx:65-69`). |

### Addressing — `wearablePreviewProps` (`Preview.tsx:140-152`)

```tsx
const ethereumUrn = asset.network === Network.ETHEREUM
  ? (isNFT(asset) ? asset.urn || '' : getEthereumItemUrn(asset))
  : ''

const wearablePreviewProps =
  asset.network === Network.ETHEREUM
    ? { urns: [ethereumUrn] }
    : { contractAddress: asset.contractAddress, itemId, tokenId }
// where (Preview.tsx:95-104):
//   itemId  = asset.itemId  (if present)   → catalog/mint item
//   tokenId = asset.tokenId (else)         → a specific owned NFT
// exactly one of itemId/tokenId is set, never both.
```

For the Shop's secondary listings (`fetchListings`), each item has `contractAddress` + `tokenId` (network Polygon), no `itemId`. So the props are `{ contractAddress, tokenId }`.

### Profile resolution — where the connected avatar comes from

`AssetImage.container.ts:15-31` (verbatim logic):

```ts
const profiles = getProfiles(state)          // decentraland-dapps profile module
const wallet = getWallet(state)
let avatar: Avatar | undefined = undefined
if (wallet && !!profiles[wallet.address]) {
  const profile = profiles[wallet.address]
  avatar = profile.avatars[0]
}
// → passed as the `avatar` prop → profile={avatar ? avatar.ethAddress : 'default'}
```

**Shop equivalent (no redux):**
- Connected address = `useWallet(s => s.session?.address)` (`src/store/wallet.ts`; `Session.address` is the lowercased wallet address).
- The Shop already has a catalyst profile fetch: `useProfile(address)` (`src/hooks/useProfile.ts`) hits `{PEER_URL}/lambdas/profiles/{address}` and returns `avatars[0]`.
- **`profile` prop:** pass the raw connected address string when connected (`session?.address`), else `'default'`. You do NOT need to pre-fetch the profile to feed `WearablePreview` — the iframe resolves `profile=<address>` against the catalyst itself. Use `useProfile` only if you additionally want `skin`/`hair` overrides or to verify the user actually has a published avatar (fall back to `'default'` if `useProfile` returns undefined, to avoid the iframe rendering an empty default when the address has no profile).

```tsx
const address = useWallet(s => s.session?.address)
const { data: avatar } = useProfile(address)          // avatars[0] or undefined
const profile = address && avatar ? address : 'default'
```

> Note: the Shop's `useProfile` returns a trimmed `ProfileAvatar` ({ name, avatar.snapshots }). To also pass `skin`/`hair` you'd extend it to include `avatar.skin.color` / `avatar.hair.color` and `colorToHex` them. This is optional polish — the iframe already applies the avatar's own skin/hair when given a real `profile` address.

### Emote vs wearable (branching)

- `isEmote = asset.category === NFTCategory.EMOTE` (`Preview.tsx:311`).
- **Emote:** `type = undefined` → the preview app auto-plays the emote on the avatar. Add `wheelZoom=1.5`, `wheelStart=100`. Use `EmoteControls` (play/stop) if you want playback controls.
- **Wearable:** `type = PreviewType.AVATAR` (on avatar) or `PreviewType.WEARABLE` (alone). Marketplace defaults to WEARABLE and toggles to AVATAR via a try-on button. **For the Shop's requirement ("mounted on the user's avatar"), default to `PreviewType.AVATAR`** and pass a `FASHION*` `emote` pose so the avatar isn't in a T-pose. Optionally keep a toggle to `WEARABLE`.

### Minimal Shop preview component (recommended)

```tsx
import { WearablePreview } from 'decentraland-ui2/dist/components/WearablePreview'
import { PreviewType, PreviewEmote, Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'

const FASHION = [PreviewEmote.FASHION, PreviewEmote.FASHION_2, PreviewEmote.FASHION_3]

function ItemPreview({ item }: { item: CatalogItem }) {
  const address = useWallet(s => s.session?.address)
  const { data: avatar } = useProfile(address)
  const profile = address && avatar ? address : 'default'
  const isEmote = item.category === 'emote'
  const dev = config.chainId === 80002
  const rarityColor = Rarity.getColor((item.rarity as Rarity) ?? Rarity.COMMON)
  const pose = FASHION[(Math.random() * FASHION.length) | 0]

  return (
    <WearablePreview
      id="shop-item-preview"
      contractAddress={item.contractAddress}
      // secondary listings carry tokenId; mint items would carry itemId — never both
      tokenId={item.tokenId ?? undefined}
      itemId={item.itemId ?? undefined}
      profile={profile}
      type={isEmote ? undefined : PreviewType.AVATAR}
      emote={isEmote ? undefined : pose}
      background={rarityColor}
      wheelZoom={isEmote ? 1.5 : undefined}
      wheelStart={isEmote ? 100 : undefined}
      dev={dev}
      disableFadeEffect
    />
  )
}
```

(Ethereum items would use `urns={[urn]}` instead of contract/token; the Shop's current listings are Polygon-only.)

---

## 2. Layout spec (Figma node `796:64222`)

Overall frame 1920×1168. Two-column detail above, collection carousel below-right. Screenshot in this dir (`/private/tmp/.../detail-figma.png`) shows: big avatar preview panel left, info column right (title, chips, description, creator/collection avatars, PRICE/STOCK, Buy now + Add to cart), and the carousel area to the right/below.

### 2.1 Structure

```
NavBar (existing, 92px)
Tabs strip (existing search + cart, 64px)
Breadcrumb  ("Collectibles / Wearables / Starry Eyed Shades")   node 796:64254, x=63 y=183
┌──────────────────────────────┬──────────────────────────────────────────┐
│  PREVIEW PANEL                │  INFO COLUMN                               │
│  (node 796:64255, 903×752)    │  (node 796:64313, x=1195, width 522)       │
│  contains <Player> avatar     │   • Title "Starry Eyed Shades" (34px)      │
│  preview 447×811, centered    │   • bookmark/detail icon (top-right, 93×38)│
│  on a light-gray rounded      │   • Chip row: rarity + category + gender   │
│  panel                        │     (node 796:64331, y=50, h=22)           │
│                               │   • "PRICE" label + credits value          │
│                               │   • creator avatar + collection avatar     │
│                               │     (node 796:64340, two "username" 142×78)│
│                               │                                            │
│                               │  PRICE / CTA card (node 796:64257,         │
│                               │   x=1176 y=637, 532×214):                   │
│                               │   • Section1 (y0,h98): PRICE | STOCK        │
│                               │     - "PRICE" 22px label + credits glyph    │
│                               │       (poligon 30px) + value "15" (36px)    │
│                               │     - "STOCK" label + "24/50"               │
│                               │   • CTAs (y98,h116): two full-width 40px    │
│                               │     buttons stacked, 12px gap:              │
│                               │       BUY NOW  (purple gradient)            │
│                               │       ADD TO CART (dark #242129 + cart ico) │
└──────────────────────────────┴──────────────────────────────────────────┘
COLLECTION CAROUSEL  ("My Awesome Collection")  — sibling cards row
```

### 2.2 Measurements & tokens (reuse Shop `--*` vars in `index.css`, from DESIGN_TOKENS.md)

- **Content width:** ~1721px inside 54px page gutters (matches nav). Preview panel ≈ 903px, info column ≈ 522px, gap ≈ 40px+ between.
- **Preview panel:** light-gray media surface `#ecebed` (`--media`), rounded `12px` (`--radius-card`), avatar centered; rarity radial-gradient glow behind the avatar (`radial-gradient(light, dark)` from `Rarity.getGradient(rarity)`), same as `Preview.tsx:307-309`.
- **Title:** Inter 700 ~28–34px, `#161518` (`--text`). (Figma node text box 313×34.)
- **Chip row** (`796:64331`): rarity chip + category chip + gender chip, gap ~8px, chip height 22px. Reuse the card chip styles from `CARD_SPEC.md §3`: rarity chip bg `rgba(161,75,243,0.3)` / text `#a14bf3` / radius 4px / label 8.56px 600 uppercase; category & gender chips bg `#ecebed` radius 4px.
- **Description:** Inter 400 ~14px, `--text-2`.
- **Creator / Collection** (`796:64340`): two side-by-side blocks (142×78 each), a small round avatar (32px) + a "CREATOR" / "COLLECTION" caption label above the name. Labels Inter 600 ~10px uppercase, muted.
- **PRICE block** (`796:64266-64273`): "PRICE" label (Inter 600 ~13px uppercase, muted) + info "ⓘ" glyph; below it the credits glyph (poligon/credits SVG ~30px, `src/assets/icons/credits.svg`) + amount (Inter 700 ~30–36px, `--text-2`). Shop shows credits: `item.priceCredits`.
- **STOCK block** (`796:64290-64298`): "STOCK" label + "24/50" value. For the Shop's single secondary listing, stock is effectively 1 (or omit STOCK for secondary listings; show it only for mint/catalog items with `available`).
- **CTA buttons** (`796:64311-64312`): two full-width buttons, height 40px, radius 8px (`--radius-btn`), 12px vertical gap, padding 0 16px, label Inter 600 13px uppercase ls 0.46px:
  - **BUY NOW**: gradient `--amethyst` (`linear-gradient(180deg,#c640cd,#691fa9)`), text `--soft-white`. (Immediate single-item checkout — reuse the existing buy flow in `src/lib/buy.ts`.)
  - **ADD TO CART**: bg `--black-btn` (`#242129`), text `--soft-white`, leading `ico-cart-solid` icon. Same visual as the card CTA (`AssetCard.tsx:68-71`). Disabled → "IN CART".
- **Bookmark/favourite** (`796:64330`): top-right of the info column, reuse the `ico-heart` fav button pattern from `AssetCard.tsx:40-46`.

### 2.3 Collection carousel (below, node group `796:64313` shows "My Awesome Collection" + username cards row)

- Section title: Inter 600 ~20px (`--text`) — e.g. "More from My Awesome Collection".
- A horizontal row of `AssetCard`-style cards (reuse the existing `AssetCard` component / card CSS). Figma shows carousel arrows + dots on the overview (see `DESIGN_TOKENS.md §5`): ~53×52px circular arrows flanking the row, 12px dots. For v1 a simple horizontal scroll row of cards is acceptable; add arrows/dots as polish.
- Each carousel card is a sibling item of the same collection (§3). Clicking one navigates to that item's detail route (§4) → the page re-renders with the new item.

---

## 3. Collection carousel — data source & efficient switching

### 3.1 Data source (marketplace)

The "more from this collection" list is fetched by **`ItemAPI.get()`** → `GET /v1/items` filtered by the collection's `contractAddress`:

- API: `src/modules/vendor/decentraland/item/api.ts` — `get(filters)` builds `/v1/items?<params>` and always appends `includeSocialEmotes=false`. `contractAddresses` → repeated `contractAddress=` params (`buildItemsQueryString`, lines 103-105).
- Saga: `src/modules/item/sagas.ts` `handleFetchCollectionItemsRequest` calls `marketplaceItemAPI.get({ first, contractAddresses })`.
- Dispatched by `CollectionProvider` with `{ first: collection.size, contractAddresses: [collection.contractAddress] }`.

So the concrete request is:

```
GET {marketplaceServerUrl}/v1/items?first=<collectionSize>&contractAddress=<collectionAddress>&includeSocialEmotes=false
```

`first` in the marketplace = `collection.size` (all items in the collection). For a carousel, cap it (e.g. `first=20`).

### 3.2 Shop equivalent (add to `src/lib/api.ts`)

The Shop reads catalog/items from `config.marketplaceServerUrl` / `config.nftApiUrl` (`/v1/items` lives under the marketplace-server, same host used by `fetchTrade`). Add:

```ts
// Sibling items of the same collection (the "more from this collection" carousel).
export async function fetchCollectionItems(
  contractAddress: string,
  { first = 20 }: { first?: number } = {}
): Promise<CatalogItem[]> {
  const qs = new URLSearchParams({
    contractAddress,
    first: String(first),
    includeSocialEmotes: 'false'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionItems ${res.status}`)
  const { data } = (await res.json()) as { data: RawCatalogItem[] }
  return (data ?? []).map(toCatalogItem)   // toCatalogItem already exists
}
```

Notes / caveats:
- `/v1/items` returns **catalog items** (keyed by `itemId`, price = mint/cheapest listing), not the specific secondary-listing `tokenId`s the Shop's grid browses via `fetchListings`. That's fine for a "browse the collection" carousel: the carousel shows the collection's items; when the user picks one, resolve its buyable trade via `fetchTradeForItem(contractAddress, itemId)` (already in `api.ts:255`) to get a `tradeId` for cart-add. If you specifically want secondary tokens on sale from that collection, query orders by `contractAddress` instead (extend `fetchListings`).
- The Shop needs the current item's collection `contractAddress` — it's already on `CatalogItem.contractAddress`. The Shop lacks a separate collection-name lookup; the collection title can come from the item's metadata or a `/v1/collections?contractAddress=` call (optional, cosmetic).
- `map(toCatalogItem)` keeps rarity/gender/thumbnail/priceCredits consistent with the grid cards.

### 3.3 Efficient switching (avoid many iframes)

**Do NOT render a `WearablePreview` per carousel card.** Two viable strategies:

**(A) Static thumbnails in the carousel + one hero preview (simplest, recommended for v1).**
Carousel cards render the item's static `thumbnail` `<img>` (like a non-hovered `AssetCard`). Only the hero/detail area has a live `<WearablePreview>`. Clicking a carousel card changes the route param → the hero item changes → the single hero iframe reloads for the new item. One iframe total.

**(B) Shared-iframe hover previews in the carousel (matches marketplace card behavior).**
Reuse the shared-iframe provider from `CARD_SPEC.md` (`EmotePreviewPlayerProvider` / `useEmotePreviewPlayer` — one `<WearablePreview>` mounted once via `createPortal`, cards call `show(imageEl, source)` / `hide()` on hover, item swapped by `postMessage UPDATE` with no reload). Wrap the carousel in the provider. This gives hover-play in the carousel without N iframes.

**Hero-preview switching without a full reload (optional optimization).**
For the main detail preview, keep the iframe URL stable (mount once with `profile=default`, id `shop-item-preview`) and swap the displayed item via a direct `postMessage`:

```ts
import { sendMessage, PreviewMessageType, Rarity } from '@dcl/schemas'
const iframe = document.getElementById('shop-item-preview') as HTMLIFrameElement | null
iframe?.contentWindow && sendMessage(iframe.contentWindow, PreviewMessageType.UPDATE, {
  options: {
    profile,                                   // connected address or 'default'
    contractAddress, itemId, tokenId,          // one of itemId/tokenId
    type: isEmote ? undefined : PreviewType.AVATAR,
    background: Rarity.getColor(rarity)
  }
})
```

This keeps the Babylon scene warm (no iframe reboot) when switching items — same mechanism the marketplace card hover uses (`CARD_SPEC.md §4c`). Drive the spinner off an identity key, not a LOAD counter (`CARD_SPEC.md §4g`), and remember the **first** `LOAD` = iframe booted (controllable), subsequent LOADs = item finished. For v1, plain prop-driven reload (strategy A) is fine; add the postMessage optimization if switching feels janky.

---

## 4. Routing & data flow (Shop)

### 4.1 Route

The Shop browses `fetchListings` — USD-pegged open listings, each keyed by `tradeId` with a `tokenId` + `contractAddress` (network Polygon). Marketplace routes are `/contracts/:contractAddress/items/:itemId` (mint) and `/contracts/:contractAddress/tokens/:tokenId` (specific NFT). For the Shop:

- **Primary route (secondary listings):** `/item/:contractAddress/:tokenId`.
- Carry the `tradeId` for cart-add. Two options:
  - **Router state:** navigate with `state: { tradeId }` from the grid card (grid already has `item.tradeId`). Cheapest, no extra fetch.
  - **Re-resolve:** on the detail page, if `tradeId` is absent (deep link/refresh), resolve the buyable trade from `contractAddress`+`tokenId` via an orders query (extend `api.ts`, mirroring `fetchTradeForItem` but by `tokenId`). Prefer this as the robust path so deep links work.

Register in `src/App.tsx`:

```tsx
<Route path="/item/:contractAddress/:tokenId" element={<ItemDetail />} />
```

Link from the grid card (`AssetCard.tsx`) — wrap the media/name in a `<Link to={`/item/${item.contractAddress}/${item.tokenId}`} state={{ tradeId: item.tradeId }}>` (the card currently has no navigation).

### 4.2 Data fetching on the detail page

```tsx
const { contractAddress, tokenId } = useParams()
// 1. The item being viewed (name, rarity, thumbnail, price):
//    - fastest: pass the CatalogItem via router state from the grid.
//    - robust (deep link): fetch NFT meta by contract+token (reuse fetchNftMeta pattern in api.ts)
//      and resolve its trade for the credits price + tradeId.
// 2. Its buyable trade (for BUY NOW / cart-add):
const { data: trade } = useQuery(['trade', tradeId], () => fetchTrade(tradeId!), { enabled: !!tradeId })
// 3. Sibling items for the carousel:
const { data: siblings } = useQuery(
  ['collection-items', contractAddress],
  () => fetchCollectionItems(contractAddress!),
  { enabled: !!contractAddress }
)
```

### 4.3 Cart-add carrying `tradeId`

The cart stores `CatalogItem`s (`src/store/cart.ts`) and the checkout uses `item.tradeId` directly (see `api.ts:28-30` comment). So **Add to cart** on the detail page must add a `CatalogItem` that includes `tradeId` + `tokenId` — identical shape to what the grid produces in `fetchListings`. When switching carousel items, ensure the currently-displayed item's `tradeId` is resolved before enabling Add to cart (disable the button / show a spinner until the trade resolves). BUY NOW uses the same `tradeId` via the existing single-item buy path (`src/lib/buy.ts`).

---

## 5. Concrete build plan

1. **`src/lib/api.ts`** — add `fetchCollectionItems(contractAddress, { first })` (§3.2). Optionally add `fetchListingByToken(contractAddress, tokenId)` to re-resolve `tradeId` for deep links (mirror `fetchTradeForItem`, filter orders by `tokenId`).
2. **`src/components/ItemPreview.tsx`** — the on-avatar `<WearablePreview>` (§1 minimal component). Props: `profile` from `useWallet` + `useProfile`, `type=PreviewType.AVATAR` for wearables / `undefined` for emotes, `emote` FASHION pose for wearables, `background=Rarity.getColor(rarity)`, `dev=config.chainId===80002`, addressing by `contractAddress`+`tokenId`/`itemId` or `urns`. Give it a stable `id` (`shop-item-preview`).
3. **`src/pages/ItemDetail.tsx`** — new page:
   - `useParams()` → `contractAddress`, `tokenId`; `useLocation().state?.tradeId` (fallback: re-resolve).
   - Layout per §2: left `<ItemPreview>` on the rarity-gradient panel; right info column (title, chips, description, creator/collection, PRICE credits, STOCK, BUY NOW + ADD TO CART).
   - `ADD TO CART` → `useCart().add(currentItem)` (a `CatalogItem` with `tradeId`+`tokenId`). Disable → "IN CART" (reuse `AssetCard.tsx:67-71` logic).
   - `BUY NOW` → existing single-item buy flow (`src/lib/buy.ts`).
   - Below: `<CollectionCarousel items={siblings} />`.
4. **`src/components/CollectionCarousel.tsx`** — horizontal row of cards from `fetchCollectionItems`. v1: reuse `AssetCard` (static thumbnails) with a `<Link>` to `/item/:contractAddress/:tokenId`. Polish: arrows + dots per Figma (`DESIGN_TOKENS.md §5`); or wrap in the shared-iframe provider (`CARD_SPEC.md`) for hover-play.
5. **`src/App.tsx`** — add `<Route path="/item/:contractAddress/:tokenId" element={<ItemDetail />} />`.
6. **`src/components/AssetCard.tsx`** — make the card navigate: wrap media/name in a `<Link to={`/item/${item.contractAddress}/${item.tokenId}`} state={{ tradeId: item.tradeId }}>` (guard when `tokenId` is null — mint/catalog items would link by itemId instead if that path is added later).
7. **CSS** — add `.item-detail`, `.item-detail__preview`, `.item-detail__info`, `.item-detail__price`, `.item-detail__ctas`, `.collection-carousel` classes to `src/index.css`, reusing existing `--*` tokens (`--media`, `--radius-card`, `--radius-btn`, `--amethyst`, `--black-btn`, `--soft-white`, `--rarity`, `--rarity-bg`, chip styles).
8. **Switching efficiency** — v1: prop-driven reload of the single hero iframe on route change (one iframe). If janky, add the `postMessage UPDATE` swap (§3.3) keeping the hero iframe URL stable.

### Packages / imports needed
Already available via `decentraland-ui2` + `@dcl/schemas` (used by `AssetCard.tsx`). New imports:
```ts
import { WearablePreview } from 'decentraland-ui2/dist/components/WearablePreview'
import { PreviewType, PreviewEmote, Rarity /*, PreviewMessageType, sendMessage, Network */ } from '@dcl/schemas'
```

### Gotchas (from CARD_SPEC.md, still apply)
- Never pass `tokenId` and `itemId` together (component warns).
- `dev`/env must match where the item is indexed (Amoy → `dev=true`); otherwise `contractAddress+tokenId` won't resolve.
- One warm iframe, not one per card. For the hero, keep URL stable + `postMessage UPDATE` to switch without a reload (optional).
- Ethereum items use `urns:[urn]`; Polygon uses `contractAddress`+`itemId`/`tokenId`. The Shop's listings are Polygon.
- Feeding a real `profile` address that has no published avatar renders an empty/default look — fall back to `'default'` when `useProfile` returns undefined.
```
