# Marketplace UX Improvements — Design Tokens

Source: Figma file `Z0actRbZof0tDolIdxIL3A` (Marketplace UX Improvements).
Overview/home frame node `696:35049`; Nav bar `696:35050`; Card component `619:5691` (instance `696:35101`).
Extracted via Figma MCP `get_design_context` + `get_variable_defs`. Base font: **Inter**. Base border-radius token: **6px**.

---

## 1. `:root` CSS custom properties

```css
:root {
  /* --- Brand / accent --- */
  --color-brand-violet: #a524b3;   /* cart badge, accent pills */
  --color-brand-purple: #691fa9;   /* "View all" link, banner gradient end */
  --color-brand-magenta: #c640cd;  /* banner CTA gradient start */
  --color-primary: #ff2d55;        /* DCL Red / Primary — notification badge */
  --color-dcl-red: #ff2d55;

  /* --- Neutrals (grays) --- */
  --color-true-black: #000000;
  --color-soft-black-1: #161518;   /* card asset name text, shadow color */
  --color-soft-black-2: #242129;   /* nav tab text, card price, add-to-cart bg */
  --color-gray-0: #43404a;         /* search placeholder text, network dropdown bg */
  --color-gray-2: #716b7c;         /* card "By <creator>" text */
  --color-gray-3: #a09ba8;         /* borders (search field, card) */
  --color-gray-4: #cfcdd4;         /* dropdown menu item text */
  --color-gray-5: #ecebed;         /* cart button bg, card media bg, chip bg */
  --color-soft-white: #fcfcfc;     /* button label text on dark */
  --color-true-white: #ffffff;     /* card bg */
  --color-white: #ffffff;

  /* --- Rarity chip colors --- */
  --color-rarity-legendary: #a14bf3;              /* text */
  --color-rarity-legendary-bg: rgba(161,75,243,0.3); /* chip fill (30% of #a14bf3) */

  /* --- Surfaces / overlays --- */
  --color-nav-bg: rgba(22,21,24,0.1);       /* nav bar bg (#161518 @ 10%) */
  --color-search-bg: rgba(0,0,0,0.05);      /* search field fill */
  --color-network-selected: rgba(255,255,255,0.2);
  --color-profile-ring: rgba(255,255,255,0.5);
  --color-profile-placeholder: #ff4bed;

  /* --- Radii --- */
  --radius-base: 6px;     /* borderRadius token; used by MUI <Button> */
  --radius-sm: 4px;       /* rarity/category chips */
  --radius-md: 8px;       /* icon buttons, CTA buttons, network dropdown */
  --radius-lg: 12px;      /* card, nav tabs, menu items */
  --radius-xl: 24px;      /* hero banner */
  --radius-pill: 50px;    /* search field */
  --radius-round: 100px;  /* badges, avatar */

  /* --- Shadows --- */
  --shadow-nav: 0px 4px 6.667px 0px rgba(0,0,0,0.2);
  --shadow-card-media: 1.049px 4.194px 5.243px 0px rgba(0,0,0,0.1);

  /* --- Gradients --- */
  --gradient-amethyst: linear-gradient(180deg, #c640cd 0%, #691fa9 100%); /* banner CTA */

  /* --- Type --- */
  --font-family: "Inter", sans-serif;
}
```

---

## 2. Typography

Font family everywhere: **Inter**. Weights used: Regular 400, Semi Bold 600, Bold 700.

| Role | Family | Size | Weight | Line-height | Letter-spacing | Transform | Color |
|---|---|---|---|---|---|---|---|
| Nav tab (Explore/Shop/…) | Inter | 16px | 400 | 1.75 | 0 | none | `#242129` |
| Tab / section heading ("Featured Products") | Inter | 20px | 600 | 1.5 | 0 | none | `#161518` |
| Hero heading ("Fashion week outfits") | Inter | 36px | 700 | 1.235 | 0 | UPPERCASE | `#ffffff` |
| Card asset name | Inter | 14px | 600 | 1.57 | 0 | none | `#161518` |
| Card "By <creator>" | Inter | 10px | 400 | 1.43 | 0 | none | `#716b7c` |
| Card price ("500") | Inter | 17.21px | 600 | normal | 0 | none | `#242129` |
| Rarity chip label | Inter | 8.56px | 600 | 11.851px | 0 | UPPERCASE | `#a14bf3` |
| Search placeholder | Inter | 17px | 400 | 26px | -0.2px | none | `#43404a` |
| Button/small (CTA, add-to-cart) | Inter | 13px | 600 | 24px | 0.46px | UPPERCASE | `#fcfcfc` |
| Button/large ("View all") | Inter | 15px | 600 | 24px | 0.46px | UPPERCASE | `#691fa9` |
| Badge counts (notif/cart) | Inter | 12px | 600 | 1.6 | 0 | none | `#ffffff` |
| Profile MANA balance | Inter | 16px | 600 | normal | -0.8px | none | `#ffffff` |
| Dropdown menu item | Inter | 16px | 400 | 1.75 | 0 | none | `#cfcdd4` |
| Network dropdown ("ETHEREUM") | Inter | 13px | 600 | 24px | 0.46px | UPPERCASE | `#ffffff` |

Figma named type tokens:
- `typography/subtitle1` = Inter Regular 16 / lh 1.75 / ls 0
- `H6 Semi Caps` = Inter Semi Bold 16 / lh 100% / ls 0
- `button/small` = Inter Semi Bold 13 / lh 24 / ls 0.46
- `button/large` = Inter Semi Bold 15 / lh 24 / ls 0.46

---

## 3. Marketplace Card spec  (node `619:5691`)

- **Dimensions:** 201px wide (base component) × 300px tall. In the home grid each card renders 305.8px wide (5 across a 1593px row, 16px gutter).
- **Background:** `#ffffff` (`--color-true-white`)
- **Radius:** 12px (`--radius-lg`); media area rounds top corners only, info area rounds bottom corners only.
- **Layout:** vertical flex — media block (flex-grow) on top, info block below.

**Media area (`619:5692`)**
- Background: `#ecebed` (`--color-gray-5`)
- Border: 0.25px solid `#a09ba8` on top + left + right (no bottom)
- Radius: top-left/top-right 12px
- Centers the asset image; image size 136.316px, shadow `1.049px 4.194px 5.243px 0px rgba(0,0,0,0.1)`
- **Favourite/heart** icon top-right: 20px, offset right 8.54px / top 7.81px

**Info area (`619:5703`)**
- Padding: 8px all sides
- Gap between rows: 6.491px
- Border: 0.243px solid `#a09ba8` on bottom + left + right
- Radius: bottom-left/bottom-right 12px
- Contains: asset name (14/600, `#161518`) → "By <creator>" (10/400, `#716b7c`) → price row → chip row

**Price row (`635:734`)**
- MANA/poligon glyph 14.919px + amount "500" (17.21px, 600, `#242129`), ~9.55px gap.

**Chip row (`619:5724`)** — gap 2.434px, items bottom-aligned
- **Rarity chip** (`Legendary`): bg `rgba(161,75,243,0.3)`, text `#a14bf3`, radius 4px, padding 1.623px 6.491px, label 8.56px/600 uppercase, lh 11.851px.
- **Category chip** (eyewear/pants icon): bg `#ecebed`, radius 4px, padding 1.623px 6.491px (icon-only variant 1.623px 3.246px), icon 14.605px.
- Additional icon-only chips reuse the category chip style.

**Add-to-cart button variant (`738:53265`)** (card CTA / hover-state action)
- bg `#242129`, height 40px, radius 8px, padding 0 8px, gap 8px
- icon (cart) 20px + label "ADD TO CART" (13/600 uppercase, `#fcfcfc`, ls 0.46px)
- Note: no distinct hover style was exposed in the frame; treat this dark "Add to cart" button as the card's action/hover affordance.

---

## 4. Nav bar spec  (node `696:35050`)

- **Background:** `rgba(22,21,24,0.1)` over the page (translucent dark)
- **Padding:** 16px vertical, 54px horizontal
- **Shadow:** `0px 4px 6.667px 0px rgba(0,0,0,0.2)`
- **Height:** ~92px; layout is space-between (logo+tabs left, actions right)
- **Logo:** decentraland MANA logo 60px; 48px gap to tabs
- **Tabs group:** gap 24px between tabs
  - Menu tab: padding 8px vertical / 24px horizontal (tabs with a chevron use pl 24 / pr 16), radius 12px, gap 5.333px
  - Tab label: Inter 16/400, color `#242129`, lh 1.75
  - Tabs: Explore, Shop ▾, Create ▾, Learn (▾ = chevron-down 20px)
- **Right actions:** gap 48px (inner group gap 24px)
  - **Notification button:** padding 8px, radius 8px, bell icon 24px; badge `#ff2d55`, 20px round, count "12" (12/600 white)
  - **Profile avatar:** 48px, 2px ring `rgba(255,255,255,0.5)`, radius 100px

**Search + cart bar (Tabs strip, node `696:35058`)**
- Row gap 24px, padding 12px vertical
- **Search field (`696:35060`):** 496×40px, bg `rgba(0,0,0,0.05)`, 1px border `#a09ba8`, radius 50px (pill); search icon ~20.7px at left (inset ~12.28px); placeholder "Search item, creator, collection, name..." Inter 17/400 `#43404a`, ls -0.2px.
- **Cart button (`696:35068`):** 40px square, bg `#ecebed`, radius 8px, cart icon 32px; badge bg `#a524b3` (brand violet), 20px round, count "1" (12/600 white).

---

## 5. Tabs / section header spec  (node `696:35097`)

- Row: space-between; left title, right "View all" link.
- **Section title:** Inter 20/600, `#161518`, lh 1.5 (e.g. "Featured Products").
- **"View all" button (`696:35099`):** MUI text button, `variant="text" color="secondary" size="large"`; label Inter 15/600 uppercase, color `#691fa9` (brand purple), ls 0.46px, lh 24px; trailing right-arrow icon (18×22 masked, 24px source); padding 8px v / 11px h; radius `--borderradius` 6px.

**Card grid**
- 5 cards per row across a 1593px content row; card render width 305.8px; horizontal step 321.8px → **16px gutter**.
- Section vertical rhythm: header → 52px → card grid (300px tall).

**Carousel**
- **Dots (`696:35106`):** 12px ellipses, 20px pitch (8px gap); 3 active + 1 hidden.
- **Slider arrows (`696:35111` right / `696:35112` left):** ~53.3×52.5px circular arrow controls, flanking the card row (left x=0, right x=1665.66).

---

## 6. Hero / banner spec  (node `696:35082`)

- **Banner (`696:35083`):** full content width (1721px) × 304px, radius 24px (`--radius-xl`), background image (`Banner A`) cover.
- **Heading (`696:35094`):** "FASHION WEEK OUTFITS" — Inter 36/700 uppercase, white, lh 1.235, centered; positioned ~top 94px, left ~299px (center-anchored).
- **CTA button (`696:35084`):** "EXPLORE COLLECTION" — 217.4×40px, radius 8px, gradient `linear-gradient(180deg, #c640cd 0%, #691fa9 100%)` (DCL Amethyst), label Inter 13/600 uppercase `#fcfcfc`, ls 0.46px; positioned left 81px / top 170px.

---

## 7. Icon assets → usage map

All saved to `/Users/juanma/Projects/dcl/shop/app/src/assets/icons/` as SVG (currentColor-friendly `fill="none"` outline SVGs from Figma).

| File | Figma name / node | viewBox | Used in |
|---|---|---|---|
| `cart.svg` | `boxicons:cart` (`696:35069`) | 0 0 32 32 | Search bar cart button (nav strip) |
| `cart-solid.svg` | `boxicons:cart` (`718:40853`) | — | Card "Add to cart" button (dark CTA) |
| `heart.svg` | `Favourite` (`635:6539`) | 0 0 20 20 | Card favourite (top-right of media) |
| `credits.svg` | poligon/MANA glyph (`I635:734;26:1376`) | 0 0 13.77 13.77 | Card price row (the "diamond"/MANA mark); also profile balance |
| `category-eyewear.svg` | category icon `Group` (`I619:5730;115:2341`) | 0 0 17.8 19.58 | Card category chip (eyewear/pants-style category glyph) |
| `search.svg` | `search copy` (`696:35062`) | 0 0 21.33 20.72 | Search field leading icon |
| `bell.svg` | `NotificationsFilled` (`1245:23494`) | 0 0 24 24 | Nav notifications button |
| `chevron-down.svg` | `ExpandMoreFilled` (`1062:11238`) | 0 0 20 20 | Nav tab dropdowns (Shop/Create), network dropdown |
| `view-all-arrow.svg` | `Icon Right` (`10004:113709`) | 0 0 24 24 | Section "View all" trailing arrow |
| `carousel-arrow.svg` | `Slider Arrows` (`696:35111`) | — | Carousel next/prev controls (reused L/R) |
| `mana-logo.svg` | `decentraland-mana-logo 1` (`210:11191`) | — | Nav bar brand logo |
| `ethereum.svg` | `mdi:ethereum` (`635:7144`) | 0 0 16 16 | Network dropdown / chain selector |

**Notes on missing/deferred icons:**
- **Gender ♀/♂ icons** were not present as distinct nodes in the overview frame (the card's per-attribute chips reused the category glyph). Pull them from the detail/filter frames if needed.
- Two cart variants were downloaded (`cart.svg` outline for the nav search bar at 32px; `cart-solid.svg` for the card CTA at 20px) — they differ in stroke/viewport.
