import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { stashResumeIntent, takeResumeIntent } from './auth-return'

describe('auth-return resume intents', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips a cart-checkout intent', () => {
    stashResumeIntent({ type: 'cart-checkout' })
    expect(takeResumeIntent('cart-checkout')).toEqual({ type: 'cart-checkout' })
  })

  it('round-trips an item-buy intent with its path', () => {
    stashResumeIntent({ type: 'item-buy', path: '/item/0xabc/7' })
    expect(takeResumeIntent('item-buy')).toEqual({ type: 'item-buy', path: '/item/0xabc/7' })
  })

  it('consumes the intent so a second read returns null (one-shot)', () => {
    stashResumeIntent({ type: 'cart-checkout' })
    expect(takeResumeIntent('cart-checkout')).not.toBeNull()
    expect(takeResumeIntent('cart-checkout')).toBeNull()
  })

  it('returns null when the requested type does not match, and clears the entry', () => {
    stashResumeIntent({ type: 'item-buy', path: '/item/0xabc/7' })
    expect(takeResumeIntent('cart-checkout')).toBeNull()
    // even the matching type no longer resolves it — a mismatched read still consumes
    expect(takeResumeIntent('item-buy')).toBeNull()
  })

  it('returns null when nothing was stashed', () => {
    expect(takeResumeIntent('cart-checkout')).toBeNull()
  })

  it('drops a stale intent (older than the max age)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    stashResumeIntent({ type: 'cart-checkout' })
    // 16 minutes later — past the 15-minute freshness window
    vi.setSystemTime(new Date('2026-01-01T00:16:00Z'))
    expect(takeResumeIntent('cart-checkout')).toBeNull()
  })

  it('keeps a still-fresh intent within the max age', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    stashResumeIntent({ type: 'cart-checkout' })
    vi.setSystemTime(new Date('2026-01-01T00:14:00Z'))
    expect(takeResumeIntent('cart-checkout')).toEqual({ type: 'cart-checkout' })
  })

  it('ignores a corrupt stored value without throwing', () => {
    sessionStorage.setItem('shop:resume_after_signin', '{not json')
    expect(() => takeResumeIntent('cart-checkout')).not.toThrow()
    expect(takeResumeIntent('cart-checkout')).toBeNull()
  })
})
