import { describe, it, expect, vi, afterEach } from 'vitest'
import { between } from './random'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('between', () => {
  it('returns the low end when the roll is 0 and stops short of the high end at 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(between([10, 20])).toBe(10)

    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(between([10, 20])).toBeLessThan(20)
  })

  it('scales the roll across the range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    expect(between([0, 80])).toBe(20)
  })

  it('stays inside the range over many rolls', () => {
    for (let i = 0; i < 200; i++) {
      const value = between([-5, 5])
      expect(value).toBeGreaterThanOrEqual(-5)
      expect(value).toBeLessThanOrEqual(5)
    }
  })
})
