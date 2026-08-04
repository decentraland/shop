import { afterEach, describe, expect, it, vi } from 'vitest'
import { shuffle } from './shuffle'

afterEach(() => vi.restoreAllMocks())

describe('shuffle', () => {
  it('keeps every item exactly once and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input)
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect(out).not.toBe(input)
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['a'])).toEqual(['a'])
  })

  it('reorders when random always picks the first slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(shuffle(['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
  })

  it('is identity when random always picks the current slot', () => {
    // 0.999… floors to `i` at every step, i.e. every element swaps with itself.
    vi.spyOn(Math, 'random').mockReturnValue(0.9999999)
    expect(shuffle(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('preserves object references', () => {
    const a = { id: 1 }
    const b = { id: 2 }
    const c = { id: 3 }
    const out = shuffle([a, b, c])
    expect(out).toHaveLength(3)
    expect(out).toContain(a)
    expect(out).toContain(b)
    expect(out).toContain(c)
  })
})
