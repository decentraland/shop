# Reskin Ideas — `feat/marketplace-light-reskin` → the Shop

> **Source branch:** `origin/feat/marketplace-light-reskin` (classic Decentraland marketplace).
> **Compared against:** `origin/master`.
> **Read-only research** — nothing in the marketplace repo was modified.
> All file paths below are relative to `/Users/juanma/Projects/dcl/marketplace/webapp/`.
>
> ⚠️ Every commit on the branch is tagged `[WIP, do not deploy]` and the cart/bundles are explicitly "demo-only". Treat the code as a **visual reference**, not production-ready logic. The prices, MANA components, and cart wei math all leak web3 and must be re-mapped to the Shop's USD/credits model.

---

## Implementation status (branch `feat/light-reskin`)

Theme sourced from Figma (`Marketplace-UX-Improvements`, node 738-53266): primary `#691fa9` + Amethyst
gradient `#c640cd → #691fa9`; the Shop's existing type scale was kept (owner decision).

**Done:**
- Primary CTA = Amethyst gradient, solid purple on hover/press + outlined variant (Idea 1).
- Card hover-lift, no colored ring (Idea 11 lift).
- Add-to-cart slides up over the media on hover; solid + "IN CART" once added (Idea 4 card-side).
- Shimmer over the 3D preview with a 600ms grace timer (Idea 8); skeleton gradient tuned (Idea 6).
- Per-rarity chip color with auto-contrast text via `lib/rarity.ts` (Idea 3).
- Horizontal filter bar (Section two-column / Rarity checklist / Price / Sort), sidebar removed (Idea 10).
- Circular carousel arrows with soft shadow + hover scale (Idea 11 arrows).
- "Save X%" + strikethrough price primitive in CSS (`.save-badge` / `.price-was`), ready for bundles.

**Deferred:**
- Bundles / merchandising (Idea 5) — needs a real bundle pricing model (show price = charged price;
  no synthetic Save%). The Save% primitive is in place for when pricing exists.
- LoadingBar sweep (Idea 7) — no load-more / infinite scroll in the Shop yet, nothing to attach to.
- Shared-iframe 3D-on-hover (Idea 9) — heavy; revisit after the basics settle.

---

## Executive summary — the "vibe"

The reskin turns the historically **dark, red-accented, web3-heavy** marketplace into a **bright, white/grey, purple-accented e-commerce storefront** that deliberately reads like Amazon / a Roblox-style catalog. The core moves:

1. **Dark → light theme.** Swaps `darkTheme` for `lightTheme` (both decentraland-ui and decentraland-ui2/MUI). Everything now sits on white (`#ffffff`) with a soft near-white gradient (`#ffffff → #f3f2f6`) behind 3D previews.
2. **Red → purple brand.** The primary accent goes from DCL red `#ff2d55` to **purple `#821dbb`** (hover `#9626d4`), applied to both UI libraries via CSS variables.
3. **Neutral rarity.** The loud per-rarity color washes behind wearables/emotes are replaced by one neutral near-white backdrop; rarity survives only as a small colored **chip** revealed on hover.
4. **Amazon-style centered layout.** A single centered `max-width: 1396px` reading column shared by nav tabs, home, browse and detail; **sticky nav tabs + horizontal filters bar** on scroll.
5. **Retail conventions bolted on.** A **shopping cart** (icon + badge + slide-down panel + hover "Add to Cart" on cards), **collection/animation bundles** with strikethrough "was" price + green "Save X%" badge, and a "Buy the whole collection" upsell on the detail page.
6. **Polished loading + micro-interactions.** Shimmer **skeleton cards** replace spinners, a purple **sweep LoadingBar** for "load more", **shimmer skeleton over the 3D preview** (masks the iframe's own spinner), card **hover-lift**, "Add to Cart" **slide-up reveal**, and a **3D auto-rotating model on wearable-card hover**.
7. **Big, heavy display typography.** Home section titles jump to **48px / weight 700–900 / negative letter-spacing**; the item-detail title is 48px/900 with a faux text-stroke.

This is very close in spirit to the Shop's own Figma direction (`DESIGN_TOKENS.md`) — same Inter font, same white cards, same purple family, same rarity-chip idea. The main **difference to reconcile**: the Shop's tokens use purple `#a524b3 / #691fa9` and keep DCL red `#ff2d55` as a notification color; the reskin standardizes on **`#821dbb`**. Pick one purple before importing (see Idea 1).

---

## Color palette / theme tokens (verbatim)

### Brand / primary (from `src/index.css`)
```css
/* decentraland-ui */
--primary: #821dbb;
--primary-hover: #9626d4;

/* decentraland-ui2 / MUI */
--mui-palette-primary-main: #821dbb;
--mui-palette-primary-dark: #6a1799;
--mui-palette-primary-light: #b06fd6;
```

### Light-theme neutrals (inherited from `decentraland-ui` light-theme.css, used everywhere as `var(--…)`)
```css
--background: #ffffff;
--text: #16141a;            /* also written #16141a / #161518 in places */
--secondary-text: #676370;  /* also #736e7d / #6b6873 in ad-hoc styles */
--divider: #67637033;       /* = rgba(103,99,112,0.2) */
--card: #ffffff;
--text-on-primary: #ffffff;
```

### Ad-hoc greys used across the reskin (not tokenized — worth tokenizing in the Shop)
| Value | Where / meaning |
|---|---|
| `#16141a` / `#161518` | primary text, dark chip/button text |
| `#2b2a30` | dark "Add to Cart" button background (hover `#43404a`) |
| `#736e7d` | card price grey, muted labels |
| `#6b6873` | filter labels / sort dropdown text |
| `#3f3c47` | active/hover filter label |
| `#ececed` | rarity badge pill, filter chips, smart chip |
| `#f5f4f7` | popover/panel hover, price histogram bg, cart thumb bg |
| `#f3f2f5` / `#f3f2f6` | arrow-hover bg, preview gradient edge |
| `rgba(115,110,125,0.25)` | input/dropdown borders |
| `rgba(115,110,125,0.18)` | panel borders, dividers |
| `#1d9bf0` | verified-creator check (Twitter-blue) |
| `#1a8f4c` on `rgba(26,143,76,0.12)` | "Save X%" green badge |

### Neutral rarity backdrop (`src/utils/rarity.ts`)
```ts
const NEUTRAL_BACKGROUND = '#fbfbfc'                      // solid bg for WearablePreview
const NEUTRAL_GRADIENT: [string, string] = ['#ffffff', '#f3f2f6']  // radial, center→edge
```
Rarity chips themselves keep their real color via `Rarity.getColor(rarity)`, with auto black/white text chosen by luminance (`getReadableTextColor`, threshold luminance > 150 → `#16141a` else `#ffffff`).

### Typography
- Family: **Inter** (`'Inter', Helvetica, Arial, sans-serif`) — matches the Shop.
- Home/section titles: `font-size: 48px; line-height: 1.1; font-weight: 700; letter-spacing: -1px; text-transform: capitalize`.
- Home subtitles: `font-size: 24px; line-height: 1.3; margin-top: 12px; letter-spacing: 0.5px; font-weight: normal`.
- Item-detail title: `48px / weight 900 / line-height 1.05 / letter-spacing -1.25px` plus `-webkit-text-stroke: 0.4px currentColor` (because Inter loads a single weight, the stroke fakes the extra heaviness).
- Creator-items heading: `30px / 700 / letter-spacing -1.2px`.

### Radii / shadows / spacing (recurring values)
- **Radii:** inputs & dropdowns `12px`; small chips/buttons `6px`/`10px`; cards `16px` (bundles) / `10px` (asset cards); popovers `12–14px`; cart panel `14px`; pills/badges `9px`.
- **Shadows:** popover `0 12px 32px rgba(22,21,24,0.12)`; cart panel `0 16px 40px rgba(22,21,24,0.16)`; sticky filters bar `0 10px 12px -10px rgba(22,21,24,0.16)`; card-hover `0 12px 28px rgba(22,21,24,0.1)`; round arrows `0 6px 16px rgba(22,21,24,0.16)`.
- **Container:** centered `max-width: 1396px`, side padding `48px`; grid gutter `16px`.
- **Transitions:** almost everything is `0.12s–0.2s ease`; card hover-lift `translateY(-3px)`.

---

## ⭐ Quick wins (S-effort, high-impact — start here)

1. **Purple accent + white theme baseline** — one variable swap; the whole app inherits it. (Idea 1)
2. **Shimmer skeleton cards** on catalog load instead of a spinner — self-contained component, ~50 lines. (Idea 6)
3. **Purple "sweep" LoadingBar** for load-more / pagination. (Idea 7)
4. **Shimmer over the 3D preview** while `WearablePreview` boots (masks the iframe's own spinner) — the Shop already uses `WearablePreview`, so this drops in. (Idea 8)
5. **Card hover-lift + rounded arrows** (`translateY(-3px)` + `0 12px 28px` shadow; white circular arrows outside carousels). (Idea 11)
6. **"Save X%" green badge + strikethrough original price** on any bundle/discount UI. (Idea 5)
7. **Neutral near-white preview backdrop** (`radial-gradient(#ffffff, #f3f2f6)`) + rarity as a small chip, not a full color wash. (Idea 3)
8. **Big display titles** (48px/700, negative tracking) for home sections. (Idea 12)

---

## Prioritized idea list

Effort legend: **S** ≤ half a day · **M** ~1–2 days · **L** ~3+ days / needs design decisions.

---

### 1. Light theme + purple primary as the design baseline  ·  Bring: **YES**  ·  Effort: **S**
- **What:** Global switch to a white surface with a single purple accent (`#821dbb`, hover `#9626d4`), driven entirely through CSS variables so both component libraries follow.
- **Where:**
  - `src/index.tsx` — `darkTheme` → `lightTheme`.
  - `src/themes/index.ts` — imports `dark-theme.css` → `light-theme.css`.
  - `src/index.css` — the `:root` block overriding `--primary` / `--mui-palette-primary-*`.
- **Maps to Shop:** The Shop is already light. The action item is **reconciling the purple**: reskin uses `#821dbb`; Shop `DESIGN_TOKENS.md` uses `--color-brand-violet #a524b3` / `--color-brand-purple #691fa9`. Recommend adopting `#821dbb` as `--color-primary` (or picking one and updating `DESIGN_TOKENS.md`) so cart badge, filter badges, active dots, focus rings and CTAs all share it.
- **web3 flag:** none. Clean.

---

### 2. Centered max-width layout + sticky nav tabs + sticky horizontal filters bar  ·  Bring: **YES**  ·  Effort: **M**
- **What:** Single centered reading column (`max-width: 1396px`, `48px` side padding) shared by nav, home, browse and detail. On scroll, the nav tabs stick under the top navbar (`top: 92px`) and the filters bar sticks under the tabs (`top: 181px`) with a soft bottom shadow so content reads as scrolling underneath.
- **Where:** `src/index.css` (`.Navigation` sticky block, container rules); `src/components/AssetFiltersBar/AssetFiltersBar.css` (sticky `top: 181px`, `box-shadow: 0 10px 12px -10px rgba(22,21,24,0.16)`).
- **Maps to Shop:** Apply the centered container to the Shop shell; make `Explore`/`Overview` filter/sort row sticky. The Shop uses React Router v6 layout routes — put the sticky bar in the browse layout. The pixel offsets (`92`/`181`) depend on the Shop's navbar height, so re-measure.
- **web3 flag:** none.

---

### 3. Neutral rarity backdrop + rarity-as-chip  ·  Bring: **YES**  ·  Effort: **S–M**
- **What:** Stop washing each item in its rarity gradient. Every wearable/emote sits on the same near-white radial (`radial-gradient(#ffffff, #f3f2f6)`, solid `#fbfbfc`). Rarity survives as a small uppercase colored chip (real rarity color, auto-contrast text) that only appears **on hover** on cards. `WearablePreview` is set to `disableBackground` so the parent gradient shows through.
- **Where:** `src/utils/rarity.ts` (the neutral palette helpers); `src/components/AssetCard/AssetCard.tsx` (`getReadableTextColor`, `AssetCard__rarityChip`); `src/components/AssetImage/Preview/Preview.tsx` (`disableBackground` + neutral bg); `src/components/EmotePreviewPlayer/EmotePreviewPlayer.tsx`.
- **Maps to Shop:** The Shop already has a `rarity chip` token. Adopt the **neutral preview backdrop** and the **hover-reveal chip** pattern; reuse `getReadableTextColor` verbatim for contrast. The Shop's item cards / ItemDetail use `WearablePreview` — pass `disableBackground` + the neutral bg the same way.
- **web3 flag:** none (rarity is a cosmetic tier, not web3 jargon).

---

### 4. Shopping cart: hover "Add to Cart" on cards + icon/badge + slide-down panel  ·  Bring: **YES (adapt)**  ·  Effort: **M–L**
- **What:** Full retail cart UX:
  - Card hover reveals a rounded **"Add to Cart"** button that **slides up from the bottom** (`translateY(calc(100% + 16px))` → `0`, opacity 0→1); when added it turns purple and reads "Added to Cart".
  - Navbar **cart icon** (rounded square, `40×40`, `12px` radius) with a purple **count badge** top-right.
  - Click opens a **slide-down panel** (`360px`, `14px` radius, `0 16px 40px` shadow) listing thumb + name + price + remove, a total row, and a full-width purple BUY button. Empty state: "Your cart is empty".
  - State via a `CartContext` (React Context + `localStorage`).
- **Where:** `src/components/Cart/CartButton.tsx` + `CartButton.css`; `src/components/Cart/CartContext.tsx`; hover button lives in `src/components/AssetCard/AssetCard.tsx` + `AssetCard.css` (`.AssetCard__addToCart`).
- **Maps to Shop:** The Shop **already has a `Cart.tsx` page and Zustand** — use Zustand instead of Context (the Shop's canonical store), but lift the **visual** CartButton/panel + the card hover-reveal button verbatim. The Shop can persist via its existing store.
- **web3 flag:** ⚠️ heavy. `CartItem.price` is "MANA in wei", it renders a `<Mana>` glyph, sums with `BigNumber`, and the button says "BUY". For the Shop: replace with **USD/credits** amounts, drop the Mana component, and format as `$` / credits. The `network` field is web3 — remove it. Rebuild the price math on plain numbers.

---

### 5. Bundles: collection/animation packs with "was" price + green "Save X%"  ·  Bring: **YES (adapt)**  ·  Effort: **M**
- **What:** Merchandising primitives:
  - **Home bundle carousels** ("Bundles for you", "Animation Packs") — 4-up grid of bundle cards, each with overlapping thumbnails (`margin-left: -18px`), name, count, **strikethrough original price + bold bundle price + green "Save X%" pill**, Buy button, hover-lift, paginated with outside arrows + animated dots.
  - **Item-detail upsell** — a "Buy the whole collection" strip (gradient card `linear-gradient(180deg,#faf9fc,#ffffff)`, overlapping thumbs, same price/save treatment, Buy-bundle button).
- **Where:** `src/components/HomePage/HomeBundles/HomeBundles.{tsx,module.css}`; `src/components/AssetPage/ItemDetail/CollectionBundle.{tsx,module.css}`.
- **Maps to Shop:** Great fit for a Roblox-style storefront. The **"Save X%" green badge + strikethrough** (`#1a8f4c` on `rgba(26,143,76,0.12)`) is a reusable price component — build it once, use on cards, bundles, detail. Home carousel maps to the Shop's `Overview.tsx`.
- **web3 flag:** ⚠️ prices are MANA/wei via `<Mana>`. Re-denominate to USD/credits; the strikethrough/save layout is currency-agnostic and reusable as-is.

---

### 6. Shimmer skeleton cards on initial catalog load  ·  Bring: **YES**  ·  Effort: **S**
- **What:** Replace the full-screen spinner with a grid of card-shaped shimmer placeholders (image block + 3 text lines + price line). Column-aware: shows `columns × 3` skeletons.
- **Where:** `src/components/AssetList/AssetCardSkeleton.{tsx,css}` (shimmer keyframes `sk-shimmer`, gradient `#efeef2 → #e2e0e7 → #efeef2`, `1.4s`); wired in `src/components/AssetList/AssetList.tsx`.
- **Maps to Shop:** Drop-in for `Explore.tsx` / `MyAssets.tsx` grids while React Query is `isLoading`. Match the Shop's card dimensions/radius.
- **web3 flag:** none.

---

### 7. Purple "sweep" LoadingBar for load-more  ·  Bring: **YES**  ·  Effort: **S**
- **What:** Footer "loading more" indicator: four rounded segments where a purple highlight sweeps left→right (staggered `animation-delay` 0/0.15/0.3/0.45s, `lb-sweep` toggling `#d9d8dd ↔ var(--primary)`). Also: load-more appends skeletons that **complete the partial row + add a full row** (column-aware math in `AssetList.tsx`).
- **Where:** `src/components/AssetList/LoadingBar.{tsx,css}`; `loadMoreSkeletonCount` logic in `AssetList.tsx`.
- **Maps to Shop:** Use with the Shop's infinite scroll / React Query `fetchNextPage`. The "complete-the-row" skeleton trick is a nice touch and framework-agnostic.
- **web3 flag:** none.

---

### 8. Shimmer over the 3D preview (mask the iframe spinner)  ·  Bring: **YES**  ·  Effort: **S**
- **What:** While `WearablePreview` boots, overlay a shimmer fill (`.Preview__loadingSkeleton`, same gradient as skeleton cards) instead of a loader. A **600ms grace timer** keeps the shimmer on briefly after `onLoad` so the iframe's own cross-origin spinner never flashes ("shimmer then spinner" double-load fix).
- **Where:** `src/components/AssetImage/Preview/Preview.css` (`.Preview__loadingSkeleton`, `preview-shimmer`); `src/components/AssetImage/Preview/Preview.tsx` (`loadGraceRef` + `setTimeout(…, 600)`).
- **Maps to Shop:** The Shop uses `decentraland-ui2`'s `WearablePreview` on ItemDetail and cards — this is nearly copy-paste. High polish for low effort.
- **web3 flag:** none.

---

### 9. 3D auto-rotating model on wearable-card hover  ·  Bring: **MAYBE**  ·  Effort: **L**
- **What:** Hovering a wearable card swaps the static thumbnail for a slowly auto-rotating 3D model, via a single **shared** off-screen `WearablePreview` iframe that repositions over the hovered card (perf trick — one iframe, not one per card). Wearables use `type: WEARABLE, disableAutoRotate: false, autoRotateSpeed: 0.4, wheelStart: 0`.
- **Where:** `src/components/EmotePreviewPlayer/EmotePreviewPlayer.tsx` (`sourceToOptions`, shared portal iframe); triggered in `src/components/AssetCard/AssetCard.tsx` (`canShowEmotePreview` now includes wearables; `handleEmoteHoverEnter`).
- **Maps to Shop:** Compelling for a storefront, but heaviest item — needs the shared-iframe orchestration and hover/pointer gating (`(hover: hover) and (pointer: fine)`, mobile guarded). Note the marketplace already saw spinner-sticking bugs here (see repo commit history). Build after the quick wins land and only if perf is acceptable.
- **web3 flag:** none functionally; keep any "wearable/emote" copy but it's not blocking jargon.

---

### 10. Horizontal filters bar: text-trigger popovers, section flyouts, rarity list, fixed search+sort  ·  Bring: **MAYBE**  ·  Effort: **L**
- **What:** Replaces the left sidebar with a single-line horizontal bar: text-only filter triggers (grey label `#6b6873` + chevron, active/open darker `#3f3c47`, purple count badge) opening white popovers (`12px` radius, `0 12px 32px` shadow); a two-column **Section dropdown** with a subcategory flyout; a **Rarity** checklist; fixed-width search (`260px`, `12px` radius, focus border purple) and sort (`248px`, ellipsized label) pinned right.
- **Where:** `src/components/AssetFiltersBar/` — `AssetFiltersBar.{tsx,css}`, `FilterPopover/`, `SectionDropdown/`, `RarityDropdown/`, `AssetSearchBar/`.
- **Maps to Shop:** Strong pattern for `Explore.tsx`, but it's the most code and tightly coupled to marketplace routing (`browse` action, `Section` enum, `useGetBrowseOptions`). Reimplement the **visual pattern** on the Shop's own filter state rather than porting the logic. The `FilterPopover` (trigger + panel + count badge) is the reusable nugget.
- **web3 flag:** ⚠️ the reskin removed the "Network" filter from the bar (good — network is web3). Keep it removed; don't reintroduce chain/network filters in the Shop.

---

### 11. Card & carousel micro-interactions  ·  Bring: **YES**  ·  Effort: **S**
- **What:** (a) Card hover-lift `translateY(-3px)` + `0 12px 28px rgba(22,21,24,0.1)`; (b) white **circular arrows** (`44px`, `border-radius: 50%`, `0 6px 16px` shadow) positioned **outside** carousels (`left/right: -64px`), hover `scale(1.06)`; (c) animated **page dots** — inactive `8px` grey circle, active stretches to a `22px` purple pill.
- **Where:** `HomeBundles.module.css`, `CreatorItems.module.css`, `HomePage/Slideshow/Slideshow.css` (arrows restyled white/circular, active dot `#821dbb`).
- **Maps to Shop:** Reuse across every carousel/grid in `Overview.tsx` and `ItemDetail.tsx`. Pure CSS, no logic.
- **web3 flag:** none.

---

### 12. Big display typography for section & detail titles  ·  Bring: **YES**  ·  Effort: **S**
- **What:** Home section titles `48px / line-height 1.1 / weight 700 / letter-spacing -1px / capitalize`, subtitle `24px / weight 400 / +0.5px`; empty subtitles collapse (`:empty { display:none }`). Item-detail title `48px / weight 900 / -1.25px` with `-webkit-text-stroke: 0.4px currentColor` to fake heaviness (Inter loads one weight).
- **Where:** `src/components/HomePage/HomePage.css`; `src/components/AssetPage/Title/Title.module.css`.
- **Maps to Shop:** Apply to `Overview.tsx` section headers and `ItemDetail.tsx` title. The Shop's Figma tokens currently cap section headings at 20px and hero at 36px — the reskin is bolder; confirm with the owner which scale wins. The text-stroke trick is worth keeping only if the Shop also ships single-weight Inter.
- **web3 flag:** none.

---

### 13. Redesigned item-detail panel  ·  Bring: **MAYBE**  ·  Effort: **M**
- **What:** Right panel restructured: big bold title → creator row ("CREATOR [avatar] name") → thin divider → chips → clean price card → date block pinned at bottom ("DATE" label + value). Favorites pill hidden. Preview area gets a **vertical collection strip** of `96px` thumbnails beside the main preview (`CollectionStrip`). The price card (`BestBuyingOption`) is stripped to two actions: **Buy** + dark **Add to Cart** (`#2b2a30`, hover `#43404a`), hiding "buy with card", "make offer", and the MANA icon.
- **Where:** `src/components/AssetPage/ItemDetail/ItemDetail.{tsx,module.css}`, `CollectionStrip.{tsx,module.css}`, `useDetailExtras.ts`; `src/components/AssetPage/BestBuyingOption/BestBuyingOption.module.css`; `src/components/AssetPage/Title/Title.module.css`.
- **Maps to Shop:** The Shop has its own `ITEM_DETAIL_SPEC.md` and `ItemDetail.tsx` — cherry-pick the **layout ideas** (header block + divider + date-at-bottom, collection strip, two-button price card) rather than porting the marketplace's coupling.
- **web3 flag:** ⚠️ the "hide buy-with-card / make-offer / MANA icon" changes are marketplace-specific; the Shop should show its own USD/credits Buy + Add-to-Cart. "Make offer" is a web3-market concept — keep it out of the Shop.

---

### 14. Verified-creator blue check on cards  ·  Bring: **YES**  ·  Effort: **S**
- **What:** A Twitter-blue (`#1d9bf0`) check-circle icon next to a creator who has a claimed name; card creator line prefixed with "By ". Detects via `profile.avatars[0].hasClaimedName`.
- **Where:** `src/components/AssetCard/AssetCard.tsx` (`isVerifiedCreator`, `verifiedBadge`); `AssetCard.css` (`.verifiedBadge`).
- **Maps to Shop:** Nice trust signal for a storefront. The Shop can key it off whatever "verified builder" flag its data has.
- **web3 flag:** "claimed name" is a DCL-name/web3 concept — **rename** the underlying check to a generic "verified creator" flag in the Shop; the visual is fine.

---

### 15. Light-theme fixups for dark 3rd-party components  ·  Bring: **REFERENCE ONLY**  ·  Effort: **S**
- **What:** A batch of `!important` overrides forcing dark `decentraland-ui` bits onto the light theme: navbar (`nav::before` white translucent bar, dark links), rarity badges (`#ececed` pill / `#16141a` text), rarity filter/array pills, price histogram recharts bars recolored (in-range `#ff2d55` → purple, out `#4f1414` → `#d9d6de`), SMART filter chip.
- **Where:** `src/index.css` (navbar + readability + filter blocks); `src/components/AssetFilters/SpecialFilter/SpecialFilter.css`.
- **Maps to Shop:** The Shop is greenfield and doesn't ship these dark components, so **don't port the hacks** — but they're a useful checklist of which decentraland-ui components ignore the theme, if the Shop ever pulls one in. The recharts fill-override technique (`svg path[fill='#ff2d55']`) is a handy trick to file away.
- **web3 flag:** none (but note: the price histogram is a web3-y market feature — the Shop likely won't want it).

---

## Reconciliation notes for the owner

- **Purple conflict:** reskin `#821dbb` vs Shop tokens `#a524b3`/`#691fa9`. Decide one before importing; I lean toward `#821dbb` since the reskin applies it consistently across both UI libs.
- **Type scale conflict:** reskin section titles are 48px; Shop Figma tokens say 20px section / 36px hero. Confirm the intended scale.
- **Everything cart/bundle/price is MANA/wei** in the reskin. The layouts are reusable; the currency layer is not — re-map to USD/credits and strip `<Mana>`, `network`, `BigNumber`, "BUY"/"Buy with MANA" wording (reskin already shortened "Buy with MANA" → "Buy" in `en.json`, which is the right direction).
- **New copy** added in `en.json` worth reusing (web2-safe): `add_to_cart`, `added_to_cart`, `collection_bundle.*`, `creator_items.title` ("Other Items from the Creator"), `home_bundles.*` ("Bundles for you" / "Grab a whole collection at a discount"), `animation_packs.*`.
