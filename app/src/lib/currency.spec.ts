import { describe, it, expect } from 'vitest'
import {
  formatAmount,
  formatCredits,
  formatCreditsFull,
  CURRENCY,
  USD_CENTS_PER_CREDIT,
  creditsToUsd,
  usdCentsToCredits,
  usdCentsToCreditsFloor
} from './currency'

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

/**
 * The peg and its two rounding directions.
 *
 * These matter more than they look: the same division used to be written inline at fifteen call sites,
 * and the direction is the part that is easy to get wrong. Rounding a PRICE down would quote a credit
 * count that cannot cover what is owed; rounding a BALANCE up would show a credit the holder cannot
 * spend. The asymmetry is deliberate, so it is pinned here rather than left to each call site.
 */
describe('the credit peg', () => {
  it('should be a fixed 10 US cents', () => {
    expect(USD_CENTS_PER_CREDIT).toBe(10)
  })

  describe('creditsToUsd', () => {
    it('should convert exactly, with no float drift on the awkward amounts', () => {
      expect(creditsToUsd(0)).toBe(0)
      expect(creditsToUsd(1)).toBe(0.1)
      expect(creditsToUsd(45)).toBe(4.5)
      expect(creditsToUsd(235)).toBe(23.5)
      expect(creditsToUsd(5_500_000)).toBe(550_000)
    })

    it('should round-trip a whole-dollar amount back through the ceil conversion', () => {
      for (const credits of [1, 7, 45, 90, 235, 475]) {
        expect(usdCentsToCredits(creditsToUsd(credits) * 100)).toBe(credits)
      }
    })
  })

  describe('usdCentsToCredits (prices and charges)', () => {
    it('should round UP so the credits always cover the cents owed', () => {
      expect(usdCentsToCredits(100)).toBe(10)
      expect(usdCentsToCredits(101)).toBe(11)
      expect(usdCentsToCredits(107)).toBe(11)
      expect(usdCentsToCredits(109)).toBe(11)
      expect(usdCentsToCredits(110)).toBe(11)
    })

    it('should never return a fractional credit', () => {
      for (const cents of [1, 3, 47, 99, 1234]) {
        expect(Number.isInteger(usdCentsToCredits(cents))).toBe(true)
      }
    })
  })

  describe('usdCentsToCreditsFloor (balances and payouts)', () => {
    it('should round DOWN so it never shows a credit that cannot be spent', () => {
      expect(usdCentsToCreditsFloor(100)).toBe(10)
      expect(usdCentsToCreditsFloor(107)).toBe(10)
      expect(usdCentsToCreditsFloor(109)).toBe(10)
      expect(usdCentsToCreditsFloor(110)).toBe(11)
      expect(usdCentsToCreditsFloor(9)).toBe(0)
    })

    it('should differ from the charging conversion on any remainder — the asymmetry is the point', () => {
      expect(usdCentsToCredits(107)).toBe(11)
      expect(usdCentsToCreditsFloor(107)).toBe(10)
    })
  })
})
