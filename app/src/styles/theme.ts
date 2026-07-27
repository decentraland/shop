// Design tokens for the Emotion `styled` layer. These values are DUPLICATED in `styles/index.css`
// (`:root` custom properties) and MUST be kept in sync one-for-one, because both are still live:
//   1. the remaining utility rules in index.css use `var(--muted)` etc., and
//   2. a handful of components emit raw `var(--…)` strings at runtime (e.g. `<Icon color="var(--muted)">`).
// So when you change a color/radius/gradient here, change the matching `--var` there too (and vice-versa).
// theme.ts may hold EXTRA tokens with no `--var` (e.g. `magenta`, `okStrong`) — that's fine; only tokens
// that exist in BOTH must agree. (Collapsing to a single source is possible later — see CLAUDE.md.)
//
// Usage: import this object directly and interpolate it — `styled.span\`color: ${theme.colors.muted}\``,
// `theme.media.maxWidth('mobile')`. It's a plain const, so no ThemeProvider is needed (the app has no
// runtime theme-switching); this also keeps unit tests provider-free. Components must NOT re-hardcode
// hexes, radii, or px breakpoints — pull them from here.
//
// Styling policy: `styled` is the default. Reach for a plain `.css` file only for genuinely complex
// cases (keyframes-heavy effects, deep descendant selectors, third-party overrides) — and even then,
// pull the values from here rather than duplicating them.

const colors = {
  bg: '#ffffff',
  text: '#161518', // Neutrals/Soft Black 1
  text2: '#242129', // Neutrals/Soft Black 2
  muted: '#716b7c', // Neutrals/Gray 2
  muted1: '#5e5b67', // Neutrals/Gray 1 — uppercase labels (price / stock)
  muted2: '#a09ba8', // Neutrals/Gray 3
  gray0: '#43404a', // Neutrals/Gray 0 — filter labels, applied-filter chip bg
  gray4: '#cfcdd4', // Neutrals/Gray 4 — hairline borders on rarity swatch chips
  line: '#e6e4ea', // subtle card border
  lineStrong: '#a09ba8', // search field / defined borders
  media: '#ecebed', // Neutrals/Gray 5 — selected/expanded section fill
  panel: '#f5f5f5',
  chip: '#ecebed',
  accent: '#691fa9', // purple — View all, Sign-in CTA, global navbar menu button
  accentHover: '#7a2bbf', // accent purple — hover shade (reusable on any purple CTA)
  accentActive: '#57178c', // accent purple — pressed shade (reusable on any purple CTA)
  navViolet: '#e3c9fb', // global (decentraland-ui2) navbar bar background — violet design
  navOverlayHover: 'rgba(255, 255, 255, 0.35)', // violet-navbar tab/button hover fill
  navOverlayActive: 'rgba(255, 255, 255, 0.45)', // violet-navbar active/pressed fill
  magenta: '#c640cd', // brand magenta — gradient stop, outline-button border, card hover borders
  brandViolet: '#a524b3', // cart badge
  rarity: '#a14bf3',
  rarityBg: 'rgba(161, 75, 243, 0.3)',
  blackBtn: '#242129', // add-to-cart bg
  softWhite: '#fcfcfc',
  dclRed: '#ff2d55',
  ok: '#1ea672',
  err: '#d33',
  // Saturated solid-fill variants of ok/err (badges, success checks, toast accents)
  okStrong: '#1f8a4c',
  errStrong: '#d64545',
  white: '#ffffff'
} as const

// Per-rarity swatch colors for the filter chips (Figma "Rarities/*" variables — a distinct palette
// from @dcl/schemas' Rarity.getColor, so they're pinned here as design tokens).
const rarities = {
  common: '#73d3d3',
  uncommon: '#ff8362',
  rare: '#34ce76',
  epic: '#289cff',
  legendary: '#a24bf3',
  exotic: '#bdfd4e',
  mythic: '#ff4bed',
  unique: '#fea217'
} as const

const gradients = {
  amethyst: 'linear-gradient(180deg, #c640cd 0%, #691fa9 100%)',
  cerise: 'linear-gradient(135deg, #ff2d55 0%, #c640cd 100%)' // card hover border
} as const

const radius = {
  card: '12px',
  chip: '4px',
  btn: '8px',
  pill: '50px',
  banner: '24px'
} as const

const font = {
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
} as const

// Stacking tiers. `overlay` sits above the global DCL navbar (position: fixed) + the sub-nav so a
// full-screen scrim dims the whole viewport, navbar included — every full-screen overlay shares it.
const z = {
  overlay: 10000
} as const

// Canonical breakpoints (see CLAUDE.md — reuse these, don't invent new ones). `mobile` (768) is the
// primary one; the others cover a few specific layout shifts. Exported for the rare direct need, but
// deliberately NOT a key on `theme` — MUI (via decentraland-ui2) already owns a `breakpoints` key on
// Emotion's augmented `Theme`, so exposing our own there would clash. Use `theme.media.*` instead.
export const breakpoints = {
  mobile: 768,
  sm: 720,
  md: 820,
  lg: 900,
  xl: 1200
} as const

export type Breakpoint = keyof typeof breakpoints

// Media-query helpers so components write `${({ theme }) => theme.media.maxWidth('mobile')} { … }`
// instead of hardcoding widths. `maxWidth` caps at the breakpoint (mobile-down); `minWidth` starts at
// the next px up.
const media = {
  maxWidth: (bp: Breakpoint) => `@media (max-width: ${breakpoints[bp]}px)`,
  minWidth: (bp: Breakpoint) => `@media (min-width: ${breakpoints[bp] + 1}px)`
}

export const theme = { colors, rarities, gradients, radius, font, media, z }

export type AppTheme = typeof theme
