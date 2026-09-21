import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as S from './NavBar.styles'

/** Every selector Emotion emitted for the rendered tree, flattened out of the injected stylesheets. */
function emittedSelectors(): string[] {
  const out: string[] = []
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) out.push(rule.selectorText)
      // The reduced-motion reset lives one level down, and it is the one most likely to be written with
      // the wrong leading character, since it is the rule nobody looks at.
      if (rule instanceof CSSMediaRule) {
        for (const inner of rule.cssRules) if (inner instanceof CSSStyleRule) out.push(inner.selectorText)
      }
    }
  }
  return out
}

describe('NavBar.styles seasonal selectors', () => {
  // A guard against a stylis footgun that costs an afternoon each time: a nested selector that STARTS with
  // a colon is read as a pseudo-class OF the component and gets the generated class concatenated onto it,
  // so `:root[data-campaign-theme='…'] &` compiles to a rule requiring the <nav> to BE the document root.
  // It never matches, and nothing catches it — the build passes, the types pass, the styles simply do
  // nothing. Written as `html[…] &`, the class lands where it belongs.
  it('anchors the themed rules on an ancestor rather than on the tab strip itself', () => {
    render(
      <S.Tabs>
        <a href="/event" data-event>
          Halloween
        </a>
      </S.Tabs>
    )

    // Split first: the reduced-motion reset legitimately lists the unthemed selector alongside the
    // themed ones, so only the parts that actually name the theme are under test here.
    const themed = emittedSelectors()
      .flatMap(selector => selector.split(','))
      .map(part => part.trim())
      .filter(part => part.includes('data-campaign-theme'))

    expect(themed.length).toBeGreaterThan(0)
    for (const part of themed) {
      expect(part).toMatch(/^html\[data-campaign-theme/)
    }
  })
})
