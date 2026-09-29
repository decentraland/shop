import { describe, it, expect } from 'vitest'
import { preloadHero } from './preloadHero'
import { HOME_PATHS } from '../src/lib/homePath'

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'

function html(head = `${VIEWPORT}\n<title>Shop</title>`) {
  return `<!doctype html><html><head>\n${head}\n</head><body><div id="root"></div></body></html>`
}

// Only the shape the plugin reads: an emitted asset carries the source path it came from and the hashed
// name it was written under.
function bundle(overrides: Record<string, string> = {}) {
  const assets = {
    'src/assets/overview/hero-credits-outfits.webp': '_assets/hero-credits-outfits-AAA.webp',
    'src/assets/overview/hero-credits-mobile.webp': '_assets/hero-credits-mobile-BBB.webp',
    ...overrides
  }
  return Object.fromEntries(
    Object.entries(assets).map(([source, fileName]) => [
      fileName,
      { type: 'asset', fileName, originalFileNames: [source] }
    ])
  )
}

function transform(base: string, document: string, emitted = bundle()) {
  const plugin = preloadHero(base)
  const hook = plugin.transformIndexHtml as { handler: (html: string, ctx: unknown) => string }
  return hook.handler(document, { bundle: emitted })
}

describe('preloadHero', () => {
  /**
   * The bug this exists to prevent, and it shipped once: a phone's layout viewport is ~980px until the
   * viewport meta is parsed. A bootstrap placed above it asks `(max-width: 768px)` against 980, answers
   * false, and preloads the WIDE art — which the page then replaces with the phone composition, so every
   * phone downloaded both. Position is the fix, so position is what this asserts.
   */
  it('should put the bootstrap after the viewport meta, never before it', () => {
    const result = transform('/', html())

    expect(result.indexOf(VIEWPORT)).toBeLessThan(result.indexOf('<script>'))
  })

  it('should refuse to build when there is no viewport meta to anchor to', () => {
    expect(() => transform('/', html('<title>Shop</title>'))).toThrow(/viewport/)
  })

  // A hardcoded href would not fail on a rename, it would download a stale image forever.
  it('should refuse to build when a hero asset is not in the bundle', () => {
    const renamed = bundle({ 'src/assets/overview/hero-credits-mobile.webp': '' })
    delete (renamed as Record<string, unknown>)['']

    expect(() => transform('/', html(), renamed)).toThrow(/hero-credits-mobile/)
  })

  it('should reference the hashed names through the configured base', () => {
    const result = transform('https://cdn.example.test/@dcl/shop/1.2.3/', html())

    expect(result).toContain('https://cdn.example.test/@dcl/shop/1.2.3/_assets/hero-credits-outfits-AAA.webp')
    expect(result).toContain('https://cdn.example.test/@dcl/shop/1.2.3/_assets/hero-credits-mobile-BBB.webp')
  })

  // One index.html serves every route, so the bootstrap — not the build — has to decide.
  it('should carry the home paths so other routes preload nothing', () => {
    const result = transform('/', html())

    expect(result).toContain(JSON.stringify(HOME_PATHS))
  })

  // Static <link> tags would be fetched by the preload scanner on EVERY route, before any script could
  // object — which is what made /items download a hero it never renders.
  it('should emit no static preload links', () => {
    const result = transform('/', html())

    expect(result).not.toMatch(/<link[^>]+rel="preload"/)
  })
})
