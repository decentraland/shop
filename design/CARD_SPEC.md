# Asset Card + Hover Preview — Porting Spec

Target stack: **Vite + React + TypeScript + `decentraland-ui2`**.
Goal: rebuild the marketplace browse-grid card that plays a wearable/emote
preview on an avatar when hovered.

Source of truth (all paths absolute, from the marketplace repo):
- Card: `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/AssetCard/AssetCard.tsx`
- Shared hover-preview engine: `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/EmotePreviewPlayer/EmotePreviewPlayer.tsx`
- Hover-preview CSS: `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/EmotePreviewPlayer/EmotePreviewPlayer.css`
- Provider mount point: `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/BrowsePage/BrowsePage.tsx`
- Full-page (detail) preview (different component, for reference): `/Users/juanma/Projects/dcl/marketplace/webapp/src/components/AssetImage/Preview/Preview.tsx`
- `WearablePreview` React component: `decentraland-ui2/dist/components/WearablePreview/WearablePreview.js`
- Its props type: `decentraland-ui2/dist/components/WearablePreview/WearablePreview.types.d.ts`

---

## 0. TL;DR (the one thing to copy)

The card hover preview is **NOT** an iframe-per-card. It is a single shared
`<WearablePreview>` iframe rendered once via a React **context provider**
(`EmotePreviewPlayerProvider`) into `document.body` with `createPortal`. Cards
call `show(imageEl, source)` / `hide()` from the context on
`mouseenter`/`mouseleave`. The provider moves a `position:fixed` overlay to sit
exactly over the hovered card's image and swaps the rendered emote/wearable by
`postMessage`-ing a `PreviewMessageType.UPDATE` to the already-warm iframe (no
reload, no per-card iframe boot).

Preview component: **`WearablePreview` from `decentraland-ui2`** (wraps the
hosted `wearable-preview` iframe app). Key hover props:
`contractAddress` + `itemId`/`tokenId` (Matic) **or** `urns: [urn]` (Ethereum),
`profile` (user's address or `"default"`), `background` (rarity color),
`peerUrl`, `marketplaceServerUrl`, `dev`, `unityMode`,
`disableAutoRotate`, `disableFadeEffect`, `wheelZoom: 1.5`, `wheelStart: 100`.

---

## 1. Packages & versions

From `/Users/juanma/Projects/dcl/marketplace/webapp/package.json`:

```jsonc
"@dcl/schemas": "^26.0.0",
"decentraland-ui2": "^3.8.0",   // installed in repo: 3.13.1 — has WearablePreview
"decentraland-ui": "^7.1.0",    // only used for the Loader spinner; optional
"decentraland-dapps": "^28.9.0",// only for profile selectors; not required to port
"react-intersection-observer": "^9.4.3"  // card lazy-mount (inView)
```

There is **no separate `@dcl/wearable-preview` npm package** in this project.
The `WearablePreview` React wrapper ships inside **`decentraland-ui2`**; it just
builds an iframe `src` pointing at the hosted wearable-preview app
(`WEARABLE_PREVIEW_URL`, see §6). Use `decentraland-ui2 >= 3.8.0`.

Imports needed:

```ts
import { WearablePreview } from 'decentraland-ui2'
import {
  Network,
  PreviewMessageType,
  PreviewOptions,
  PreviewUnityMode,
  Rarity,
  sendMessage
} from '@dcl/schemas'
```

`sendMessage`, `PreviewMessageType`, `PreviewOptions`, `PreviewUnityMode`,
`PreviewRenderer` are all exported from `@dcl/schemas` (defined under
`@dcl/schemas/dist/dapps/preview/*`).

---

## 2. Component structure to build

```
<EmotePreviewPlayerProvider enabled={isEmotesSection}>   // mounts ONE shared iframe (portal)
  <BrowseGrid>
    <AssetCard/> x N        // each calls useEmotePreviewPlayer().show/hide on hover
  </BrowseGrid>
</EmotePreviewPlayerProvider>
```

- **`EmotePreviewPlayerProvider`** — context provider. Renders children, plus an
  overlay (`position:fixed` div containing one `<WearablePreview>`) via
  `createPortal(overlay, document.body)`. Exposes `{ show, hide }`.
- **`useEmotePreviewPlayer()`** — hook returning the context value (or `null`
  when no provider is present, e.g. wearables-only sections).
- **`AssetCard`** — the grid card. Static thumbnail `<img>` by default; on
  hover it calls `show(imageEl, source)`; on leave `hide()`.

Enable the provider only for the section that wants hover previews. In the
marketplace it is gated to the emotes section
(`BrowsePage.tsx:21` `section.startsWith('emotes')`,
`BrowsePage.tsx:24` `<EmotePreviewPlayerProvider enabled={isEmotesSection}>`).
For a shop you may want it enabled for both wearables and emotes.

---

## 3. Card component (hover wiring)

`AssetCard.tsx` — relevant excerpts.

### 3a. Gating: only hover-preview on real pointers

```tsx
// AssetCard.tsx:97-110
const { ref, inView } = useInView()             // lazy-mount card contents
const isMobile = useMobileMediaQuery()
const emotePreviewPlayer = useEmotePreviewPlayer()
const cardContainerRef = useRef<HTMLDivElement | null>(null)
const isEmoteCard = asset.category === NFTCategory.EMOTE
// viewport-width media query returns false on touch laptops; also require a
// fine hover-capable pointer so tap doesn't race the navigation click.
const supportsHover = useMemo(
  () => typeof window !== 'undefined' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  []
)
const canShowEmotePreview =
  isEmoteCard && !isMobile && supportsHover && !!emotePreviewPlayer
```

Gotcha: `matchMedia('(hover: hover) and (pointer: fine)')` is essential.
Without it, on touch devices `mouseenter` fires on tap and races the click that
navigates to the detail page.

### 3b. Enter / leave handlers

```tsx
// AssetCard.tsx:115-134
const handleEmoteHoverEnter = useCallback(() => {
  if (!emotePreviewPlayer || !canShowEmotePreview) return
  const container = cardContainerRef.current
  if (!container) return
  const imageEl = container.querySelector<HTMLElement>('.AssetImage') // the thumbnail box
  if (!imageEl) return
  emotePreviewPlayer.show(imageEl, {
    contractAddress: asset.contractAddress,
    itemId: 'itemId' in asset ? asset.itemId : null,
    tokenId: 'tokenId' in asset ? asset.tokenId : null,
    urn:     'urn'    in asset ? asset.urn ?? null : null,
    network: asset.network,
    rarity:  asset.data.emote?.rarity
  })
}, [emotePreviewPlayer, canShowEmotePreview, asset])

const handleEmoteHoverLeave = useCallback(() => {
  if (!emotePreviewPlayer || !canShowEmotePreview) return
  emotePreviewPlayer.hide()
}, [emotePreviewPlayer, canShowEmotePreview])
```

### 3c. The card element — hover listeners on the OUTER wrapper

```tsx
// AssetCard.tsx:197-219 (condensed)
<div
  ref={setWrapperRef}                                  // stores cardContainerRef + inView ref
  onMouseEnter={canShowEmotePreview ? handleEmoteHoverEnter : undefined}
  onMouseLeave={canShowEmotePreview ? handleEmoteHoverLeave : undefined}
>
  <Card link as={Link} to={getAssetUrl(asset)} onClick={onClick}>
    {inView ? (
      <>
        <AssetImage className="AssetImage ..." asset={asset} />  {/* static thumbnail */}
        <Card.Content> ...title, price, tags... </Card.Content>
      </>
    ) : null}
  </Card>
</div>
```

The ref callback combines the intersection-observer ref and the container ref:

```tsx
// AssetCard.tsx:189-195
const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
  cardContainerRef.current = node
  ref(node)
}, [ref])
```

Notes:
- **No hover debounce on the card.** `show`/`hide` fire immediately on
  enter/leave. The debounce that exists (§4) lives inside `WearablePreview`
  itself and is bypassed by this design (it uses direct `postMessage`).
- The **fallback thumbnail when not hovering** is just the card's normal
  `<AssetImage>` (a static `<img src={getAssetImage(asset)}>` — `asset.image`
  or `asset.thumbnail`, see `modules/asset/utils.ts:39-47`). The hover overlay
  paints on top of it; on leave the overlay fades out and the thumbnail shows
  again. `.AssetImage` is the element the overlay is positioned over.

`React.memo(AssetCard)` wraps the export (`AssetCard.tsx:276`).

---

## 4. The shared preview engine (`EmotePreviewPlayer.tsx`)

This is the heart of the feature. Full file at
`EmotePreviewPlayer.tsx` (277 lines). Key mechanics below.

### 4a. Context + source type

```tsx
// EmotePreviewPlayer.tsx:14-30
export type EmotePreviewSource = {
  contractAddress?: string
  itemId?: string | null
  tokenId?: string | null
  urn?: string | null
  network?: Network
  rarity?: Rarity
}
type EmotePreviewPlayerContextValue = {
  show: (target: HTMLElement, source: EmotePreviewSource) => void
  hide: () => void
}
const EmotePreviewPlayerContext = createContext<...>(null)
export const useEmotePreviewPlayer = () => useContext(EmotePreviewPlayerContext)
```

### 4b. Source → PreviewOptions (the exact UPDATE payload)

Ethereum items are addressed by URN; Matic items by `contractAddress + itemId/tokenId`.

```tsx
// EmotePreviewPlayer.tsx:45-61
const sourceToOptions = (src, env): PreviewOptions => {
  const base: PreviewOptions = {
    profile: env.profile,                    // user address (lowercased) or 'default'
    peerUrl: env.peerUrl,
    marketplaceServerUrl: env.marketplaceServerUrl,
    background: Rarity.getColor(src.rarity ?? Rarity.COMMON)
  }
  if (src.network === Network.ETHEREUM && src.urn) {
    return { ...base, urns: [src.urn] }
  }
  return {
    ...base,
    contractAddress: src.contractAddress ?? null,
    itemId: src.itemId ?? null,
    tokenId: src.tokenId ?? null
  }
}
```

### 4c. Swapping the emote WITHOUT reloading — direct postMessage

```tsx
// EmotePreviewPlayer.tsx:63-70
const PREVIEW_IFRAME_ID = 'emote-preview-player-iframe'
const dispatchUpdate = (src, env): boolean => {
  const iframe = document.getElementById(PREVIEW_IFRAME_ID) as HTMLIFrameElement | null
  if (!iframe?.contentWindow) return false
  sendMessage(iframe.contentWindow, PreviewMessageType.UPDATE, {
    options: sourceToOptions(src, env)
  })
  return true
}
```

This is why the iframe is mounted **once with a stable URL** (`profile="default"`,
no item) and never re-created per card — swapping via `UPDATE` keeps the Babylon
scene warm and avoids a full iframe reload on every hover.

### 4d. Profile injection (render emote on the logged-in user's avatar)

```tsx
// EmotePreviewPlayer.tsx:110-124
const profileAddress = useMemo(() => {
  if (wallet?.address && profiles[wallet.address]?.avatars[0]) {
    return wallet.address.toLowerCase()
  }
  return 'default'
}, [wallet?.address, profiles])

const envConfig = useMemo(() => ({
  profile: profileAddress,
  peerUrl: config.get('PEER_URL'),
  marketplaceServerUrl: config.get('MARKETPLACE_SERVER_URL')
}), [profileAddress])
```

Important: `profile` is **NOT** passed as a React prop to `<WearablePreview>`
(that would change the iframe URL and force a reload when the wallet resolves
mid-session). Instead it is injected into every `UPDATE` payload. The mounted
iframe always has `profile="default"` in its URL; the real profile arrives via
postMessage. See comment at `EmotePreviewPlayer.tsx:104-109`.

- `wallet` from redux (`getWallet`); `profiles` from
  `decentraland-dapps/dist/modules/profile/selectors`. In a fresh Vite app,
  substitute your own "current user address + has-avatar" source.

### 4e. Positioning overlay over the hovered card (follows on scroll/shrink)

```tsx
// EmotePreviewPlayer.tsx:133-151
useEffect(() => {
  if (!isVisible) return
  let rafId = 0
  const tick = () => {
    const el = targetRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setRect(prev => (prev && prev.top===r.top && prev.left===r.left &&
        prev.width===r.width && prev.height===r.height) ? prev
        : { top: r.top, left: r.left, width: r.width, height: r.height })
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(rafId)
}, [isVisible])
```

`requestAnimationFrame` loop keeps the fixed overlay glued to the hovered
`.AssetImage` even as the card shrinks on hover or the page scrolls. The overlay
is `position:fixed` so `getBoundingClientRect()` values map directly to
top/left.

### 4f. show / hide

```tsx
// EmotePreviewPlayer.tsx:153-182
const show = useCallback((target, source) => {
  targetRef.current = target
  setRarity(source.rarity ?? Rarity.COMMON)
  const r = target.getBoundingClientRect()
  setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  setIsVisible(true)
  const key = keyOf(source)
  currentKeyRef.current = key
  // only show spinner if this emote isn't already the one loaded in the iframe
  setIsEmoteLoading(key !== loadedKeyRef.current)
  if (isControllable) {
    dispatchUpdate(source, envConfig)
    pendingSourceRef.current = null
  } else {
    pendingSourceRef.current = source   // queue until iframe first LOAD
  }
}, [isControllable, envConfig])

const hide = useCallback(() => {
  targetRef.current = null
  setIsVisible(false)
  setIsEmoteLoading(false)
  pendingSourceRef.current = null
  // keep loadedKeyRef so re-hovering the same emote is instant
}, [])
```

### 4g. The state machine (spinner + iframe lifecycle)

This is the subtle part. Drive the spinner off **identity keys**, not a LOAD
counter (a LOAD counter drifts because re-hovering the same emote sends an
identical UPDATE that produces no LOAD → spinner stuck forever).

```tsx
// EmotePreviewPlayer.tsx:76-81  — stable identity of the currently-rendered item
const keyOf = (src): string => {
  if (src.network === Network.ETHEREUM && src.urn) return `eth:${src.urn}`
  return `${src.contractAddress ?? ''}:${src.itemId ?? src.tokenId ?? ''}`
}
```

Refs: `hasInitiallyLoadedRef` (iframe booted?), `currentKeyRef` (what's hovered),
`loadedKeyRef` (what the iframe last finished), `pendingSourceRef` (queued hover
before iframe is controllable).

```tsx
// EmotePreviewPlayer.tsx:215-229
// onLoad fires: (1) on first iframe boot, (2) again after every UPDATE that
// swaps the item (scene rebuilt → new LOAD).
const handlePreviewLoad = useCallback(() => {
  if (!hasInitiallyLoadedRef.current) {
    hasInitiallyLoadedRef.current = true
    setIsControllable(true)     // first LOAD only: iframe is now ready for UPDATEs
    return
  }
  loadedKeyRef.current = currentKeyRef.current   // subsequent LOAD: emote finished
  setIsEmoteLoading(false)
}, [])

const handlePreviewError = useCallback(() => {
  setIsEmoteLoading(false)      // ERROR instead of LOAD → still clear spinner
}, [])
```

Flush a hover that arrived before the iframe was controllable:

```tsx
// EmotePreviewPlayer.tsx:185-190
useEffect(() => {
  if (isControllable && pendingSourceRef.current) {
    dispatchUpdate(pendingSourceRef.current, envConfig)
    pendingSourceRef.current = null
  }
}, [isControllable, envConfig])
```

Reset lifecycle when the provider is disabled (section left) so a fresh iframe
boots next time — otherwise the first hover postMessages to an un-initialized
iframe and silently fails:

```tsx
// EmotePreviewPlayer.tsx:197-208
useEffect(() => {
  if (!enabled) {
    hasInitiallyLoadedRef.current = false
    currentKeyRef.current = null
    loadedKeyRef.current = null
    targetRef.current = null
    pendingSourceRef.current = null
    setIsControllable(false); setIsVisible(false); setIsEmoteLoading(false)
  }
}, [enabled])
```

State machine summary:

| State | Trigger | Effect |
|---|---|---|
| mounted (warming) | provider `enabled` | iframe rendered offscreen, `profile=default`, no item |
| controllable | 1st `LOAD` from iframe | `isControllable=true`; flush pending hover |
| hover new item | `show()` | overlay moves + visible; if `key!==loadedKey` show spinner; `UPDATE` sent |
| item rendered | Nth `LOAD` | `loadedKey=currentKey`; spinner off |
| render failed | `ERROR` | spinner off |
| hover same item again | `show()` | no spinner (key==loadedKey); `UPDATE` is a no-op rebuild |
| leave | `hide()` | overlay fades; `loadedKey` retained (re-hover instant) |
| section left | `enabled=false` | reset all refs; iframe unmounts |

### 4h. The mounted overlay + shared WearablePreview

```tsx
// EmotePreviewPlayer.tsx:245-269
const overlay = enabled ? (
  <div className={`EmotePreviewPlayer ${isVisible ? 'is-visible' : 'is-warming'}`}
       style={overlayStyle} aria-hidden>
    <WearablePreview
      id={PREVIEW_IFRAME_ID}
      profile="default"                                  // stable URL; real profile via UPDATE
      peerUrl={envConfig.peerUrl}
      marketplaceServerUrl={envConfig.marketplaceServerUrl}
      background={Rarity.getColor(Rarity.COMMON)}
      wheelZoom={1.5}
      wheelStart={100}
      disableAutoRotate
      disableFadeEffect
      dev={isPreviewDev}                                 // ?env=dev when peerUrl not *.decentraland.org
      unityMode={PreviewUnityMode.MARKETPLACE}
      onLoad={handlePreviewLoad}
      onError={handlePreviewError}
    />
    {isVisible && isEmoteLoading
      ? <Loader className="EmotePreviewPlayer__spinner" active size="large" />
      : null}
  </div>
) : null

return (
  <EmotePreviewPlayerContext.Provider value={contextValue}>
    {children}
    {overlay && typeof document !== 'undefined'
      ? createPortal(overlay, document.body) : null}
  </EmotePreviewPlayerContext.Provider>
)
```

`overlayStyle` (`EmotePreviewPlayer.tsx:233-243`) sets `top/left/width/height`
from `rect` and a rarity radial-gradient background:

```tsx
const [light, dark] = Rarity.getGradient(rarity)
return { top: rect.top, left: rect.left, width: rect.width, height: rect.height,
         backgroundImage: `radial-gradient(${light}, ${dark})` }
```

`isPreviewDev` (`:129`): `!envConfig.peerUrl.includes('decentraland.org')` — ties
the iframe's dev/prod mode to the peer URL, not a global env flag.

---

## 5. Overlay CSS (`EmotePreviewPlayer.css`)

```css
.EmotePreviewPlayer {
  position: fixed;
  z-index: 100;               /* above grid, below navbar(101)/modals(1000)/popups(1900) */
  border-radius: 10px;
  overflow: hidden;
  pointer-events: none;       /* never intercept clicks meant for the card */
  background-color: transparent;
  opacity: 0;
  transition: opacity 120ms ease-out;
  contain: layout paint;
}
/* warming: iframe kept rendered but hidden (NOT visibility:hidden, which can
   pause iframe rendering in some browsers). Use clip-path instead. */
.EmotePreviewPlayer.is-warming {
  top: 0; left: 0; width: 320px; height: 320px;
  opacity: 0; pointer-events: none; clip-path: inset(50%);
}
.EmotePreviewPlayer.is-visible { opacity: 1; clip-path: none; }
.EmotePreviewPlayer iframe {
  width: 100% !important; height: 100% !important;
  border: 0 !important; display: block; background: transparent;
}
/* spinner centered on the overlay */
.EmotePreviewPlayer .ui.loader.EmotePreviewPlayer__spinner {
  position: absolute; top: 50%; left: 50%; z-index: 2;
}
```

Porting to ui2: replace the Semantic `Loader` with `CircularProgress` (MUI) from
`decentraland-ui2`/`@mui/material` and drop the `.ui.loader` selectors.

---

## 6. WearablePreview props & iframe URL (from decentraland-ui2)

`WearablePreviewProps` (`WearablePreview.types.d.ts:4-59`) — the ones that matter
for a card preview:

| Prop | Type | Purpose |
|---|---|---|
| `id` | `string` | DOM id of the iframe (needed for `getElementById` postMessage) |
| `contractAddress` | `string` | Matic item address |
| `itemId` | `string` | catalog item id (mint) |
| `tokenId` | `string` | specific NFT token (owned) — **never pass with `itemId`** |
| `urns` | `string[]` | Ethereum items (`urns: [urn]`) |
| `profile` | `string` | avatar to wear it on: address or `"default"` |
| `skin`, `hair`, `eyes` | `string` | hex colors to override avatar |
| `emote` | `PreviewEmote` | pose the avatar strikes (for wearables); `FASHION*` etc. |
| `type` | `PreviewType` | `WEARABLE` \| `AVATAR` — wearable-only vs on-avatar. **Omit for emotes.** |
| `background` | `string` | hex bg color (rarity color) |
| `disableBackground` | `boolean` | transparent bg |
| `disableAutoRotate` | `boolean` | stop idle turntable spin |
| `disableFadeEffect` | `boolean` | no fade-in on load |
| `wheelZoom`, `wheelStart` | `number` | initial zoom (`1.5` / `100` used for emotes) |
| `peerUrl` | `string` | catalyst peer to resolve profile/wearables |
| `marketplaceServerUrl` | `string` | server to resolve item metadata (was `nftServerUrl`, deprecated) |
| `dev` | `boolean` | adds `?env=dev` → testnets (Amoy/Sepolia) |
| `unity` | `boolean` | use Unity renderer instead of Babylon |
| `unityMode` | `PreviewUnityMode` | e.g. `MARKETPLACE` |
| `socialEmote` | `SocialEmoteAnimation` | social-emote outcome variant |
| `onLoad(renderer?)` | cb | fires on iframe boot AND after each UPDATE rebuild |
| `onError(error)` | cb | render failure |
| `onUpdate(options)` | cb | after an UPDATE is sent |

### Emote vs wearable difference

- **Emote card**: pass the item (contract/item or urn) and **do NOT set `type`**.
  The wearable-preview app detects it's an emote and plays the animation on the
  avatar automatically. Reference: detail-page `Preview.tsx:313-317` sets
  `previewType = undefined` when `isEmote`. Emotes also use `wheelZoom=1.5`,
  `wheelStart=100`.
- **Wearable card**: set `type` = `PreviewType.WEARABLE` (item alone, spinning)
  or `PreviewType.AVATAR` (worn on avatar). To render on the avatar you also pass
  an `emote` pose so the avatar isn't in T-pose (`Preview.tsx:336` passes a random
  `FASHION*` pose when trying on / unity).

### iframe URL construction (`WearablePreview.js:29-131`)

`baseUrl = config.get('WEARABLE_PREVIEW_URL')`, then every prop is appended as a
URL-encoded query param via `safeEncodeParam(key, value)` (empty/null/`''`
skipped). Param name mapping:

```
contract, token, item, profile, urn (repeated for arrays), url, base64,
skin, hair, eyes, bodyShape, emote, camera, projection, zoom, background,
offsetX/Y/Z, cameraX/Y/Z, wheelZoom, wheelPrecision, wheelStart,
disableBackground, disableAutoRotate, disableAutoCenter, disableFace,
disableDefaultWearables, disableDefaultEmotes, disableFadeEffect,
showSceneBoundaries, showThumbnailBoundaries, peerUrl, marketplaceServerUrl,
type, panning, lockAlpha, lockBeta, lockRadius, env(=dev when dev),
unity, mode(=unityMode), username, socialEmote
```

Example resulting src (Matic emote):
```
https://wearable-preview.decentraland.org/?contract=0x..&item=3&profile=default&background=%23...&wheelZoom=1.5&wheelStart=100&disableAutoRotate=true&disableFadeEffect=true&marketplaceServerUrl=...&peerUrl=...&mode=marketplace
```

### `WEARABLE_PREVIEW_URL` defaults (decentraland-ui2 config env json)

```
prod: https://wearable-preview.decentraland.org
stg:  https://wearable-preview.decentraland.today
dev:  https://wearable-preview.decentraland.zone
```

The React component reads it from its own `config.get('WEARABLE_PREVIEW_URL')`.
In a fresh Vite app, make sure `decentraland-ui2`'s config resolves to the right
env (or pass `baseUrl` explicitly to `<WearablePreview>` — it's an accepted prop).

### Message protocol (`WearablePreview.js:141-217`)

- Component listens to `window 'message'`, ignores anything whose `origin !==
  baseUrl`. Handles `READY`, `LOAD`, `ERROR`.
- On `READY` it flushes pending options; on `LOAD` calls `onLoad(renderer)`; on
  `ERROR` calls `onError`.
- Built-in `handleUpdate` diffs options (`deep-equal`) and postMessages `UPDATE`,
  **debounced 500ms** (`WearablePreview.js:224-226` `debounce(handleUpdate, 500)`).
  The card design deliberately bypasses this by calling `sendMessage(...,
  UPDATE, ...)` directly (§4c) for zero-latency swaps. If you instead change
  React props to swap the item, expect a 500ms debounce + a URL rebuild.

---

## 7. Gotchas checklist

1. **One shared iframe, not one per card.** Per-card iframes each boot Babylon =
   janky + heavy. Mount once, `postMessage` UPDATE to swap.
2. **Keep the iframe URL stable** (`profile="default"`, no item in props). Inject
   the item and real profile only via `UPDATE`. Changing React props changes the
   URL → full iframe reload.
3. **Spinner off identity keys, not a LOAD counter.** Re-hovering the same emote
   sends an identical UPDATE → no LOAD → a counter would leave the spinner stuck.
4. **First `LOAD` ≠ item loaded.** First LOAD = iframe booted (controllable).
   Only subsequent LOADs mean an item finished rendering.
5. **Handle `ERROR` too** — clear the spinner or it hangs on failed items.
6. **Gate hover on `(hover: hover) and (pointer: fine)`** + not-mobile, or taps on
   touch devices race the navigation click.
7. **`pointer-events: none`** on the overlay so it never steals card clicks.
8. **Don't use `visibility:hidden`** to hide the warming iframe (some browsers
   pause iframe rendering); use `clip-path: inset(50%)` + `opacity:0`.
9. **rAF loop to reposition** the fixed overlay so it tracks the card on scroll
   and on hover-shrink.
10. **`dev`/env drives testnet resolution.** If `peerUrl`/`marketplaceServerUrl`
    point at prod but `dev=true`, prod catalog `contractAddress+itemId` won't
    resolve. Tie `dev` to the peer URL (`isPreviewDev`).
11. **Never pass `tokenId` and `itemId` together** — the component warns
    (`WearablePreview.js:227-229`).
12. **Ethereum vs Matic addressing.** ETH → `urns: [urn]`; MATIC →
    `contractAddress + itemId/tokenId`.
13. **The non-hover fallback is just the static thumbnail** (`asset.image` /
    `asset.thumbnail`). No preview cost until hover.

---

## 8. Minimal port plan for the new Vite app

1. `npm i decentraland-ui2@^3.8.0 @dcl/schemas@^26 react-intersection-observer`.
2. Ensure `decentraland-ui2` config resolves `WEARABLE_PREVIEW_URL` for your env
   (or pass `baseUrl` to `<WearablePreview>`).
3. Port `EmotePreviewPlayer.tsx` almost verbatim. Replace:
   - redux `getWallet`/profile selectors → your current-user hook.
   - `config.get('PEER_URL' | 'MARKETPLACE_SERVER_URL')` → your env config.
   - Semantic `Loader` → `CircularProgress` from decentraland-ui2.
4. Port `EmotePreviewPlayer.css` (drop `.ui.loader` selectors).
5. Wrap the browse route in `<EmotePreviewPlayerProvider enabled={...}>`.
6. In the card, add the `.AssetImage` box, the outer wrapper with
   `onMouseEnter/Leave`, and the `useEmotePreviewPlayer().show/hide` calls (§3).
7. For wearables (if you want on-avatar preview too), extend `EmotePreviewSource`
   / `sourceToOptions` to set `type: PreviewType.AVATAR` + an `emote` pose;
   emotes leave `type` unset.
