import { describe, it, expect } from 'vitest'
import { highlightMatches } from '~/lib/highlight'

const marked = (name: string, query: string) =>
  highlightMatches(name, query)
    .map(s => (s.match ? `[${s.text}]` : s.text))
    .join('')

describe('when highlighting what the query matched in a name', () => {
  it('should mark the start of each word a term begins, whatever the case', () => {
    expect(marked('Pirate Hat', 'pir')).toBe('[Pir]ate Hat')
    expect(marked('Pirate Hat', 'HAT pirate')).toBe('[Pirate] [Hat]')
  })

  it('should ignore accents on either side', () => {
    expect(marked('Máscara Épica', 'mascara ep')).toBe('[Máscara] [Ép]ica')
    expect(marked('Mascara', 'másc')).toBe('[Masc]ara')
  })

  it('should take the longest term that fits a word', () => {
    expect(marked('Galaxy Studio', 'gal galaxy')).toBe('[Galaxy] Studio')
  })

  it('should mark nothing when no word starts with a term, or the query has none', () => {
    expect(marked('Pirate Hat', 'rate')).toBe('Pirate Hat')
    expect(marked('Pirate Hat', '!!!')).toBe('Pirate Hat')
    expect(marked('Pirate Hat', '')).toBe('Pirate Hat')
  })

  it('should keep punctuation and spacing exactly as they were', () => {
    expect(marked('T-Shirt (Ice)', 't ice')).toBe('[T]-Shirt ([Ice])')
    expect(marked('  Spaced  ', 'sp')).toBe('  [Sp]aced  ')
  })

  it('should return one plain segment for an empty name', () => {
    expect(highlightMatches('', 'x')).toEqual([{ text: '', match: false }])
  })
})
