import { describe, expect, it } from 'vitest'

import { centsToCredits, indexPayouts, payoutForSale, type Payout } from './payouts'

/**
 * Matching a sale to the credits it paid out.
 *
 * The failure this guards against is quiet in both directions: a sale whose payout is not found renders
 * a MANA figure the seller never received, and a payout that is still held renders as nothing at all —
 * so the seller sees a sale, no credits, and no explanation. Neither shows up as an error.
 */

const TX = '0xd6312c18c93e84cca9de060c137452d12e9608ee0a79496e44f8a1a8e369f725'
const OTHER_TX = '0x' + 'a'.repeat(64)
const NOW = 1_700_000_000_000

const payout = (over: Partial<Payout> = {}): Payout => ({
  txHash: TX,
  logIndex: 8,
  netCents: 1072,
  availableAt: NOW - 1,
  available: true,
  ...over
})

describe('payoutForSale', () => {
  it('should report a sale with no payout as settled directly in MANA', () => {
    // Every sale from before proceeds-to-treasury, and every sale made while the flag is off. The seller
    // really was paid in MANA, so the row must keep showing it.
    const index = indexPayouts([payout({ txHash: OTHER_TX })])

    expect(payoutForSale(index, { txHash: TX }, NOW)).toEqual({ kind: 'direct' })
  })

  it('should report a cleared payout with the credits it paid', () => {
    const index = indexPayouts([payout()])

    // 1072 cents → 107.2 credits at $0.10 each, floored: the 2 cents of change stay in the balance.
    expect(payoutForSale(index, { txHash: TX }, NOW)).toEqual({ kind: 'credited', credits: 107 })
  })

  it('should report a held payout with the date it clears', () => {
    // THE gap this closes. Without a date the row can only omit the credits, which reads as money lost —
    // and with a chargeback hold configured that state lasts days, not minutes.
    const availableAt = NOW + 15 * 60_000
    const index = indexPayouts([payout({ available: false, availableAt })])

    expect(payoutForSale(index, { txHash: TX }, NOW)).toEqual({ kind: 'pending', credits: 107, availableAt })
  })

  it('should treat a payout whose date has passed as cleared even if the server said otherwise', () => {
    // `available` was computed when the server answered. A page left open would otherwise keep promising
    // a date that is already in the past.
    const index = indexPayouts([payout({ available: false, availableAt: NOW - 1000 })])

    expect(payoutForSale(index, { txHash: TX }, NOW)).toMatchObject({ kind: 'credited' })
  })

  it('should match regardless of hash casing', () => {
    const index = indexPayouts([payout({ txHash: TX.toUpperCase() })])

    expect(payoutForSale(index, { txHash: TX }, NOW)).toMatchObject({ kind: 'credited' })
  })

  describe("when one transaction holds several of this seller's payouts", () => {
    // A buyer taking two of the same seller's items in one cart. Both fills land in the same
    // transaction, and a sale record carries no log index, so there is no key that pairs them.

    it('should report the state but withhold the ambiguous amount', () => {
      const index = indexPayouts([payout({ logIndex: 3, netCents: 1072 }), payout({ logIndex: 9, netCents: 5000 })])

      // Naming either figure would be a coin flip between 107 and 500 credits.
      expect(payoutForSale(index, { txHash: TX }, NOW)).toEqual({ kind: 'credited', credits: null })
    })

    it('should stay pending until the LAST of them clears', () => {
      const soon = NOW + 60_000
      const later = NOW + 10 * 60_000
      const index = indexPayouts([
        payout({ logIndex: 3, available: false, availableAt: soon }),
        payout({ logIndex: 9, available: false, availableAt: later })
      ])

      // Promising `soon` would tell the seller everything has landed while part of it is still locked.
      expect(payoutForSale(index, { txHash: TX }, NOW)).toEqual({ kind: 'pending', credits: null, availableAt: later })
    })

    it('should stay pending while any one of them is still held', () => {
      const availableAt = NOW + 60_000
      const index = indexPayouts([payout({ logIndex: 3 }), payout({ logIndex: 9, available: false, availableAt })])

      expect(payoutForSale(index, { txHash: TX }, NOW)).toMatchObject({ kind: 'pending', availableAt })
    })
  })

  describe('degenerate input', () => {
    it('should treat an absent earnings block as no payouts', () => {
      // An older credits-server does not return `earnings` at all. That has to read as "paid directly",
      // not as an error — the feed still has to render.
      expect(payoutForSale(indexPayouts(undefined), { txHash: TX }, NOW)).toEqual({ kind: 'direct' })
    })

    it('should not match a sale that carries no transaction hash', () => {
      const index = indexPayouts([payout()])

      expect(payoutForSale(index, { txHash: '' }, NOW)).toEqual({ kind: 'direct' })
      expect(payoutForSale(index, { txHash: null }, NOW)).toEqual({ kind: 'direct' })
    })

    it('should drop payout rows with no hash rather than bucket them together', () => {
      // Otherwise they collide under '' and a hashless sale would match an unrelated payout.
      const index = indexPayouts([payout({ txHash: '' }), payout({ txHash: '  ' })])

      expect(index.size).toBe(0)
    })
  })
})

describe('centsToCredits', () => {
  it('should round DOWN so it never promises a credit that cannot be spent', () => {
    // The balance display floors; prices round up. A payout is a balance, so it floors.
    expect(centsToCredits(1072)).toBe(107)
    expect(centsToCredits(109)).toBe(10)
    expect(centsToCredits(9)).toBe(0)
    expect(centsToCredits(110)).toBe(11)
  })
})
