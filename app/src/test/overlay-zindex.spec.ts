import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The global DCL navbar (decentraland-ui2, position: fixed) and the shop sub-nav (z-index 40) sit on
// their own high stacking tier. Modal overlays MUST sit above them so their scrim dims the FULL
// viewport, navbar included (Figma: the buy modal / fitting room dim everything). This guards against a
// regression where a modal's z-index drops back below the navbar and the top bar stays bright.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

// Pull the raw z-index declaration inside a given CSS rule block.
function zIndexOf(selector: string): string {
  const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const block = css.match(rule)?.[1] ?? ''
  return block.match(/z-index:\s*([^;]+);/)?.[1]?.trim() ?? ''
}

// Above the sub-nav (40) and the navbar skeleton (50); comfortably clears the ui2 navbar's own fixed
// stacking. 1000 is the floor for "above the navbar".
const NAVBAR_TIER = 1000

describe('modal overlays cover the navbar', () => {
  it('defines a shared --z-overlay token above the navbar tier', () => {
    const value = css.match(/--z-overlay:\s*(\d+)/)?.[1]
    expect(value).toBeDefined()
    expect(Number(value)).toBeGreaterThan(NAVBAR_TIER)
  })

  it.each([['.buy-modal'], ['.fitting'], ['.modal-backdrop']])(
    '%s references the shared --z-overlay token (single source of truth)',
    selector => {
      expect(zIndexOf(selector)).toBe('var(--z-overlay)')
    }
  )
})
