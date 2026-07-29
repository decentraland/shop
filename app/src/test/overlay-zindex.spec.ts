import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { theme } from '~/styles/theme'

// The global DCL navbar (decentraland-ui2, position: fixed) and the shop sub-nav sit on their own high
// stacking tier. Modal overlays MUST sit above them so their scrim dims the FULL viewport, navbar
// included (Figma: the buy modal / fitting room dim everything). This guards against a regression where
// an overlay's z-index drops back below the navbar and the top bar stays bright.

// Above the sub-nav (40) and the navbar skeleton (50); comfortably clears the ui2 navbar's own fixed
// stacking. 1000 is the floor for "above the navbar".
const NAVBAR_TIER = 1000

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('modal overlays cover the navbar', () => {
  it('defines a shared overlay tier above the navbar tier', () => {
    expect(theme.z.overlay).toBeGreaterThan(NAVBAR_TIER)
  })

  // The tier is duplicated in theme.ts (JS) and styles/index.css (:root) — see CLAUDE.md, both are live
  // and must stay in sync one-for-one.
  it('keeps the --z-overlay CSS var in sync with theme.z.overlay', () => {
    const value = read('src/styles/index.css').match(/--z-overlay:\s*(\d+)/)?.[1]
    expect(value).toBeDefined()
    expect(Number(value)).toBe(theme.z.overlay)
  })

  it.each([
    ['src/styles/modal.styles.ts'],
    ['src/components/FittingRoom/FittingRoom.styles.ts'],
    ['src/components/BuyModal/modal.styles.ts']
  ])('%s takes its overlay z-index from the shared token', file => {
    expect(read(file)).toContain('z-index: ${z.overlay}')
  })

  // Tooltips are portalled to <body>, so they lost the trigger's stacking context and need their own
  // tier above every overlay — a tooltip inside a modal must not paint under it.
  it('puts the tooltip tier above the overlay tier', () => {
    expect(theme.z.tooltip).toBeGreaterThan(theme.z.overlay)
  })

  it('keeps the --z-tooltip CSS var in sync with theme.z.tooltip', () => {
    const value = read('src/styles/index.css').match(/--z-tooltip:\s*(\d+)/)?.[1]
    expect(value).toBeDefined()
    expect(Number(value)).toBe(theme.z.tooltip)
  })
})
