import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard for the credits mark's color.
 *
 * The mark is a CSS mask (see Icon.css): the glyph is painted by `background-color: currentColor`, so
 * BOTH `color` and `background` on the icon element decide what the buyer actually sees. Only the amount
 * text ever carries a context tint — the glyph itself stays near-black on light surfaces and white on
 * dark ones, never the violet accent.
 *
 * That has regressed repeatedly, because a sweep for `color:` misses the rules that paint `background:`
 * and vice versa. This test closes both holes at once: it discovers every place the source styles a
 * `<CurrencyIcon>` — `styled(CurrencyIcon)` defs plus any `className` contexts still painted from a
 * stylesheet — then fails if any of them paints the glyph with the accent. New call sites are covered
 * automatically — no list to keep in sync.
 */

// vitest runs from the app root, so `src` is where the stylesheets and call sites live.
const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = walk(SRC)
const cssFiles = files.filter(f => f.endsWith('.css'))
const tsFiles = files.filter(f => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.spec.ts'))

/**
 * `ico` is the base class every icon in the app carries, credits mark or not, so a rule targeting it
 * says nothing about the credits glyph. The mark always carries a context class alongside it, which is
 * what this guard actually checks.
 */
const BASE_CLASSES = new Set(['ico', 'ccy-mark', 'ccy'])

/** Every context class handed to a <CurrencyIcon className="…"> in the source. */
function currencyIconClasses(): string[] {
  const classes = new Set<string>()
  for (const file of tsFiles) {
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(/<CurrencyIcon[^/>]*className="([^"]+)"/g)) {
      for (const cls of match[1].split(/\s+/)) if (cls && !BASE_CLASSES.has(cls)) classes.add(cls)
    }
  }
  return [...classes]
}

/** Every `styled(CurrencyIcon)` template in the source, paired with what it paints. */
function styledPaints() {
  const found: { file: string; name: string; declaration: string }[] = []
  let count = 0
  for (const file of tsFiles) {
    const src = readFileSync(file, 'utf8')
    for (const block of src.matchAll(/(?:const|export const)\s+(\w+)\s*=\s*styled\(CurrencyIcon\)`([^`]*)`/g)) {
      count++
      for (const paint of block[2].matchAll(/\b(color|background|background-color):\s*([^;]+)/g)) {
        found.push({ file: relative(SRC, file), name: block[1], declaration: `${paint[1]}: ${paint[2].trim()}` })
      }
    }
  }
  return { found, count }
}

/** CSS rules whose selector targets one of `classes`, paired with what they paint. */
function paintedRules(classes: string[]) {
  const found: { file: string; selector: string; declaration: string }[] = []
  const targets = classes.map(c => new RegExp(`\\.${c}(?![\\w-])`))
  for (const file of cssFiles) {
    const css = readFileSync(file, 'utf8')
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().split('\n').pop()!.trim()
      if (!targets.some(t => t.test(selector))) continue
      for (const paint of rule[2].matchAll(/\b(color|background|background-color):\s*([^;]+)/g)) {
        found.push({ file: relative(SRC, file), selector, declaration: `${paint[1]}: ${paint[2].trim()}` })
      }
    }
  }
  return found
}

// The theme tokens interpolate as `${colors.accent}` etc., so match the token names too.
const ACCENT =
  /var\(--accent\)|var\(--brand-violet\)|#a14bf3|#691fa9|colors\.accent\b|colors\.brandViolet\b|colors\.rarity\b/i

describe('the credits mark', () => {
  const classes = currencyIconClasses()
  const styled = styledPaints()

  it('is rendered through styles the guard can be checked against', () => {
    // A guard that finds nothing to guard is worse than no guard: it passes silently forever.
    expect(classes.length + styled.count).toBeGreaterThan(10)
  })

  it('is never painted with the violet accent', () => {
    const violet = [
      ...paintedRules(classes)
        .filter(r => ACCENT.test(r.declaration))
        .map(r => `${r.file}: ${r.selector} { ${r.declaration} }`),
      ...styled.found
        .filter(r => ACCENT.test(r.declaration))
        .map(r => `${r.file}: styled(CurrencyIcon) ${r.name} { ${r.declaration} }`)
    ]
    expect(
      violet,
      'the credits glyph must stay near-black (or white on a dark surface) — tint only the amount text'
    ).toEqual([])
  })
})
