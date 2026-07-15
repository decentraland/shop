import { describe, it, expect } from 'vitest'
import { formatAmount, formatCredits, formatCreditsFull, CURRENCY } from './currency'

describe('formatAmount', () => {
  it('pluralizes on the amount', () => {
    expect(formatAmount(1)).toBe(`1 ${CURRENCY.nameSingular}`)
    expect(formatAmount(0)).toBe(`0 ${CURRENCY.name}`)
    expect(formatAmount(270)).toBe(`270 ${CURRENCY.name}`)
  })
})

describe('formatCredits (compact)', () => {
  it('leaves small numbers intact', () => {
    expect(formatCredits(0)).toBe('0')
    expect(formatCredits(500)).toBe('500')
    expect(formatCredits(999)).toBe('999')
  })

  it('abbreviates thousands and millions', () => {
    expect(formatCredits(12_000)).toBe('12K')
    expect(formatCredits(1_500)).toBe('1.5K')
    expect(formatCredits(5_500_000)).toBe('5.5M')
    expect(formatCredits(1_000_000)).toBe('1M')
  })

  it('caps at two fraction digits', () => {
    // 1,234,567 → 1.23M (rounded, not 1.234567M)
    expect(formatCredits(1_234_567)).toBe('1.23M')
  })
})

describe('formatCreditsFull', () => {
  it('groups with thousands separators', () => {
    expect(formatCreditsFull(500)).toBe('500')
    expect(formatCreditsFull(5_500_000)).toBe('5,500,000')
  })
})
