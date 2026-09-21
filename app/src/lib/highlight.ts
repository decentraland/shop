// Marks, in a suggestion's name, the word prefixes the query matched — the cosmetic side of the search:
// the matching itself happens on the server, this only shows the reader why a row is there.

export type HighlightSegment = { text: string; match: boolean }

// The same folding the server applies before matching: accents off, case off.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const WORD = /[\p{L}\p{N}]+/gu

/**
 * Splits `name` into segments, marking as matched the start of every word that begins with one of the
 * query's terms (the longest such term). Accents and case do not count; a query with no usable term
 * marks nothing.
 */
export function highlightMatches(name: string, query: string): HighlightSegment[] {
  const terms = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (terms.length === 0 || !name) return [{ text: name, match: false }]

  const segments: HighlightSegment[] = []
  let cursor = 0
  const push = (text: string, match: boolean) => {
    if (!text) return
    const last = segments[segments.length - 1]
    if (last && last.match === match) last.text += text
    else segments.push({ text, match })
  }

  for (const found of name.matchAll(WORD)) {
    const word = found[0]
    const start = found.index ?? 0
    push(name.slice(cursor, start), false)
    // Folded per character, so the matched prefix maps back onto the original characters even where
    // folding changes their count.
    const chars = [...word]
    const folded = chars.map(fold)
    const foldedWord = folded.join('')
    const term = terms.filter(t => foldedWord.startsWith(t)).sort((a, b) => b.length - a.length)[0]
    if (term) {
      let covered = 0
      let count = 0
      while (covered < term.length && count < chars.length) {
        covered += folded[count].length
        count += 1
      }
      push(chars.slice(0, count).join(''), true)
      push(chars.slice(count).join(''), false)
    } else {
      push(word, false)
    }
    cursor = start + word.length
  }
  push(name.slice(cursor), false)
  return segments
}
