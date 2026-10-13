import { describe, it, expect } from 'vitest'
import { formatCountCompact } from './text'

describe('formatCountCompact', () => {
  it('stays exact below ten thousand', () => {
    expect(formatCountCompact(0, 'en')).toBe('0')
    expect(formatCountCompact(9_999, 'en')).toBe('9,999')
  })

  it('goes compact from ten thousand up', () => {
    expect(formatCountCompact(10_000, 'en')).toBe('10K')
    expect(formatCountCompact(1_000_000, 'en')).toBe('1M')
  })

  it('keeps round allowances exact in their unit', () => {
    expect(formatCountCompact(64_100, 'en')).toBe('64.1K')
    expect(formatCountCompact(1_150_000, 'en')).toBe('1.15M')
    expect(formatCountCompact(4_350_000, 'en')).toBe('4.35M')
  })

  it('never rounds a count up to the next unit', () => {
    expect(formatCountCompact(999_999, 'en')).toBe('999.99K')
  })

  it('does not invent digits where the locale keeps thousands in full', () => {
    expect(formatCountCompact(12_345, 'de')).toBe('12.345')
    expect(formatCountCompact(999_999, 'de')).toBe('999.999')
  })
})
