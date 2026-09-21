import { describe, it, expect } from 'vitest'
import { NO_ACTIVE_ROW, nextActiveIndex, suggestionRowId } from '~/lib/suggestionNavigation'

describe('when moving through the suggestions with the keyboard', () => {
  it('should step down from nothing to the first row, then row by row, wrapping at the end', () => {
    expect(nextActiveIndex(NO_ACTIVE_ROW, 3, 'ArrowDown')).toBe(0)
    expect(nextActiveIndex(0, 3, 'ArrowDown')).toBe(1)
    expect(nextActiveIndex(2, 3, 'ArrowDown')).toBe(0)
  })

  it('should step up from nothing to the last row, then row by row, wrapping at the start', () => {
    expect(nextActiveIndex(NO_ACTIVE_ROW, 3, 'ArrowUp')).toBe(2)
    expect(nextActiveIndex(2, 3, 'ArrowUp')).toBe(1)
    expect(nextActiveIndex(0, 3, 'ArrowUp')).toBe(2)
  })

  it('should jump to the ends with Home and End', () => {
    expect(nextActiveIndex(1, 3, 'Home')).toBe(0)
    expect(nextActiveIndex(1, 3, 'End')).toBe(2)
  })

  it('should never activate anything when there are no rows', () => {
    expect(nextActiveIndex(NO_ACTIVE_ROW, 0, 'ArrowDown')).toBe(NO_ACTIVE_ROW)
    expect(nextActiveIndex(NO_ACTIVE_ROW, 0, 'End')).toBe(NO_ACTIVE_ROW)
  })

  it('should leave other keys alone', () => {
    expect(nextActiveIndex(1, 3, 'Enter')).toBeNull()
    expect(nextActiveIndex(1, 3, 'a')).toBeNull()
  })

  it('should make a DOM-safe id from any key', () => {
    expect(suggestionRowId('recent', 'pirate hat!')).toBe('search-row-recent-pirate-hat-')
    expect(suggestionRowId('creator', '0xAbC')).toBe('search-row-creator-0xabc')
  })
})
