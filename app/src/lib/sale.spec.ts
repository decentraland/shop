import { describe, it, expect } from 'vitest'
import { isSaleActive, saleDiscountPct, saleTimeLeft, formatCountdown, countdownTickMs } from './sale'

const NOW = 1_000_000_000_000 // fixed epoch ms for deterministic time math

describe('isSaleActive', () => {
  it('true when compare-at is above price and the window is open', () => {
    expect(isSaleActive({ priceCredits: 70, compareAtCredits: 100, saleEndsAt: NOW + 60_000 }, NOW)).toBe(true)
  })

  it('true when there is a discount and no end window', () => {
    expect(isSaleActive({ priceCredits: 70, compareAtCredits: 100 }, NOW)).toBe(true)
  })

  it('false when there is no compare-at', () => {
    expect(isSaleActive({ priceCredits: 70 }, NOW)).toBe(false)
  })

  it('false when compare-at does not beat the price', () => {
    expect(isSaleActive({ priceCredits: 100, compareAtCredits: 100, saleEndsAt: NOW + 60_000 }, NOW)).toBe(false)
    expect(isSaleActive({ priceCredits: 100, compareAtCredits: 90, saleEndsAt: NOW + 60_000 }, NOW)).toBe(false)
  })

  it('false when the window has already closed', () => {
    expect(isSaleActive({ priceCredits: 70, compareAtCredits: 100, saleEndsAt: NOW }, NOW)).toBe(false)
    expect(isSaleActive({ priceCredits: 70, compareAtCredits: 100, saleEndsAt: NOW - 1 }, NOW)).toBe(false)
  })
})

describe('saleDiscountPct', () => {
  it('rounds to a whole percent', () => {
    expect(saleDiscountPct(100, 70)).toBe(30)
    expect(saleDiscountPct(100, 65)).toBe(35)
    expect(saleDiscountPct(3, 2)).toBe(33) // 33.33 → 33
  })

  it('clamps sub-1% cuts up to 1 (never shows -0%)', () => {
    expect(saleDiscountPct(1000, 999)).toBe(1) // 0.1% → rounds to 0 → clamps to 1
  })

  it('clamps near-total cuts to 99 (never shows -100%)', () => {
    expect(saleDiscountPct(100, 0)).toBe(99)
  })

  it('returns 0 for a non-sale or invalid input', () => {
    expect(saleDiscountPct(100, 100)).toBe(0)
    expect(saleDiscountPct(100, 120)).toBe(0)
    expect(saleDiscountPct(0, 0)).toBe(0)
  })
})

describe('saleTimeLeft', () => {
  it('returns remaining ms', () => {
    expect(saleTimeLeft(NOW + 5000, NOW)).toBe(5000)
  })

  it('floors at 0 once past the end', () => {
    expect(saleTimeLeft(NOW - 5000, NOW)).toBe(0)
  })

  it('is Infinity for an open-ended sale', () => {
    expect(saleTimeLeft(undefined, NOW)).toBe(Infinity)
  })
})

describe('formatCountdown', () => {
  it('days show days + hours', () => {
    expect(formatCountdown((2 * 86400 + 4 * 3600) * 1000)).toBe('2d 4h')
  })

  it('days drop the hours when zero', () => {
    expect(formatCountdown(3 * 86400 * 1000)).toBe('3d')
  })

  it('hours show hours + minutes', () => {
    expect(formatCountdown((4 * 3600 + 12 * 60) * 1000)).toBe('4h 12m')
  })

  it('minutes show minutes + seconds', () => {
    expect(formatCountdown((12 * 60 + 30) * 1000)).toBe('12m 30s')
  })

  it('under a minute shows seconds', () => {
    expect(formatCountdown(45 * 1000)).toBe('45s')
  })

  it('empty at or past zero, and for non-finite input', () => {
    expect(formatCountdown(0)).toBe('')
    expect(formatCountdown(-1000)).toBe('')
    expect(formatCountdown(Infinity)).toBe('')
  })
})

describe('countdownTickMs', () => {
  it('ticks every second in the final hour', () => {
    expect(countdownTickMs(59 * 60_000)).toBe(1000)
  })

  it('ticks every minute when far out', () => {
    expect(countdownTickMs(2 * 3600_000)).toBe(60_000)
  })

  it('returns 0 (no ticking) when finished or open-ended', () => {
    expect(countdownTickMs(0)).toBe(0)
    expect(countdownTickMs(Infinity)).toBe(0)
  })
})
