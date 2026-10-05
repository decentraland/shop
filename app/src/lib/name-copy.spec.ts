import { describe, it, expect } from 'vitest'
import {
  NameFeeShortError,
  NameInFlightError,
  NameManaShortError,
  NameNotRegisteredError,
  NameQuoteMovedError,
  NameRefundedError,
  NameRouteUnavailableError,
  NameSettlementUnknownError,
  NameTakenError
} from '~/lib/names'
import { WrongNetworkError } from '~/lib/network'
import { formatFeeUsd, manaAloneBlockedCopy, nameFailureCopy, nameFailureIsFinal } from '~/lib/name-copy'

describe('when a NAME purchase fails', () => {
  it.each([
    ['refunded', new NameRefundedError(), /payment was returned/i],
    ['repriced', new NameQuoteMovedError(), /amount needed changed/i],
    ['unroutable', new NameRouteUnavailableError(), /isn.t available right now/i],
    ['short of MANA', new NameManaShortError(), /cover this NAME/i],
    ['short of the fee', new NameFeeShortError(), /processing fee/i],
    ['taken', new NameTakenError(), /this NAME is taken/i],
    ['already in flight', new NameInFlightError(), /still being completed/i],
    ['unconfirmed', new NameSettlementUnknownError(), /couldn.t confirm/i]
  ])('should explain a %s purchase in its own words', (_label, error, copy) => {
    expect(nameFailureCopy(error, 'mana')).toMatch(copy)
  })

  // "Your Credits were used" is not true of a NAME paid without any.
  it('should not say credits were used when a MANA-paid NAME was not registered', () => {
    expect(nameFailureCopy(new NameNotRegisteredError(), 'mana')).not.toMatch(/credits were used/i)
  })

  it('should say credits were used when a credits-paid NAME was not registered', () => {
    expect(nameFailureCopy(new NameNotRegisteredError(), 'credits')).toMatch(/credits were used/i)
  })

  it('should name both networks when the wallet is on the wrong one', () => {
    expect(nameFailureCopy(new WrongNetworkError(1, 137), 'mana')).toMatch(/polygon/i)
  })

  it('should fall back to the generic message for an error with no message', () => {
    expect(nameFailureCopy({}, 'mana')).toMatch(/couldn.t complete your purchase/i)
  })
})

describe('when deciding whether a failed NAME purchase may be retried', () => {
  it.each([
    ['not registered', new NameNotRegisteredError(), true],
    ['unconfirmed', new NameSettlementUnknownError(), true],
    ['taken', new NameTakenError(), true],
    ['already in flight', new NameInFlightError(), true],
    ['refunded', new NameRefundedError(), false],
    ['repriced', new NameQuoteMovedError(), false],
    ['short of the fee', new NameFeeShortError(), false]
  ])('should treat a %s failure as final: %s', (_label, error, final) => {
    expect(nameFailureIsFinal(error)).toBe(final)
  })
})

describe('when the MANA-alone purchase is being confirmed', () => {
  it.each([
    [
      'its route failed',
      { failed: true, quoted: false, manaShort: false, feeShort: false },
      /isn.t available right now/i
    ],
    ['it is still being priced', { failed: false, quoted: false, manaShort: false, feeShort: false }, /latest price/i],
    ['the MANA falls short', { failed: false, quoted: true, manaShort: true, feeShort: false }, /cover this NAME/i],
    ['the fee falls short', { failed: false, quoted: true, manaShort: false, feeShort: true }, /processing fee/i]
  ])('should hold it when %s', (_label, state, copy) => {
    expect(manaAloneBlockedCopy(state)).toMatch(copy)
  })

  it('should let it through once priced and covered', () => {
    expect(manaAloneBlockedCopy({ failed: false, quoted: true, manaShort: false, feeShort: false })).toBeNull()
  })
})

describe('when the route fee is shown', () => {
  it('should place the dollar sign the way the locale does', () => {
    expect({ en: formatFeeUsd(0.25, 'en'), de: formatFeeUsd(0.25, 'de') }).toEqual({
      en: '$0.25',
      de: '0,25 $'
    })
  })

  // A fee that rounds to nothing still costs something.
  it('should never show a fee as zero', () => {
    expect(formatFeeUsd(0.001, 'en')).toBe('$0.01')
  })
})
