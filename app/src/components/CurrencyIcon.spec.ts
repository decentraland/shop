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
 * and vice versa. This test closes both holes at once: it discovers every class actually handed to
 * `<CurrencyIcon>` in the source, then fails if any CSS rule paints one of them with the accent. New
 * call sites are covered automatically — no list to keep in sync.
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
const tsxFiles = files.filter(f => f.endsWith('.tsx'))

/**
 * `ico` is the base class every icon in the app carries, credits mark or not, so a rule targeting it
 * says nothing about the credits glyph. The mark always carries a context class alongside it, which is
 * what this guard actually checks.
 */
const BASE_CLASSES = new Set(['ico'])

/** Every context class handed to a <CurrencyIcon className="…"> in the source. */
function currencyIconClasses(): string[] {
  const classes = new Set<string>()
  for (const file of tsxFiles) {
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(/<CurrencyIcon[^/>]*className="([^"]+)"/g)) {
      for (const cls of match[1].split(/\s+/)) if (cls && !BASE_CLASSES.has(cls)) classes.add(cls)
    }
  }
  return [...classes]
}

/** Rules whose selector targets one of `classes`, paired with what they paint. */
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

const ACCENT = /var\(--accent\)|var\(--brand-violet\)|#a14bf3|#691fa9/i

describe('the credits mark', () => {
  const classes = currencyIconClasses()

  it('is rendered through classes the stylesheets can be checked against', () => {
    // A guard that finds nothing to guard is worse than no guard: it passes silently forever.
    expect(classes.length).toBeGreaterThan(10)
  })

  it('is never painted with the violet accent', () => {
    const violet = paintedRules(classes).filter(r => ACCENT.test(r.declaration))
    expect(
      violet.map(r => `${r.file}: ${r.selector} { ${r.declaration} }`),
      'the credits glyph must stay near-black (or white on a dark surface) — tint only the amount text'
    ).toEqual([])
  })
})
