import { describe, it, expect, beforeEach } from 'vitest'
import { ChainId } from '@dcl/schemas'
import { t } from '~/intl/i18n'
import { friendlyError, isPausedError, isRejection, ListingPausedError } from '~/lib/errors'
import { WrongNetworkError } from '~/lib/network'

const FALLBACK = "Couldn't complete checkout."

/**
 * The two WALLET-STATE failures are mapped centrally, on purpose.
 *
 * Every on-chain flow can hit them — checkout, cart, cancel, transfer, approve, mint — and for both of them
 * the generic fallback ("please try again") is not merely vague but wrong: retrying changes nothing until the
 * wallet does. Handling them here is what makes all those screens say the same true thing without each one
 * having to know anything about networks.
 */
describe('friendlyError — wallet state', () => {
  it('names both networks when the wallet is on the wrong one', () => {
    const msg = friendlyError(new WrongNetworkError(ChainId.ETHEREUM_MAINNET, ChainId.MATIC_MAINNET), FALLBACK)

    expect(msg).toContain('Ethereum Mainnet')
    expect(msg).toContain('Polygon')
    expect(msg).not.toBe(FALLBACK)
  })

  it('explains a wallet that refused the request instead of blaming the transaction', () => {
    // The production shape: ethers dresses the wallet's -32006 up as a revert.
    const err = {
      code: 'CALL_EXCEPTION',
      message: 'missing revert data; transaction reverted without a reason string',
      error: { code: -32006, message: 'Unauthorized' }
    }
    const msg = friendlyError(err, FALLBACK)

    expect(msg).not.toBe(FALLBACK)
    expect(msg.toLowerCase()).toContain('wallet')
  })

  it('still reads a user rejection as a cancellation, not a network problem', () => {
    const msg = friendlyError({ code: 4001, message: 'User rejected the request' }, FALLBACK)
    expect(msg).toBe(friendlyError({ code: 4001 }, FALLBACK))
    expect(isRejection({ code: 4001 })).toBe(true)
    expect(msg.toLowerCase()).toContain('cancel')
  })

  it('leaves everything else on the caller’s own fallback', () => {
    expect(friendlyError(new Error('boom'), FALLBACK)).toBe(FALLBACK)
    // Our own API's 401 is a sign-in problem, not a wallet one — it must not be captured by either branch.
    expect(friendlyError({ status: 401, message: 'Unauthorized' }, FALLBACK)).toBe(FALLBACK)
  })

  it('keeps mapping sale failures when asked to', () => {
    expect(friendlyError(new Error('no active listing'), FALLBACK, { sale: true })).not.toBe(FALLBACK)
  })
})

describe('when a purchase is refused because the listing is paused', () => {
  let error: unknown

  describe('and the refusal is the shop’s own pre-check', () => {
    beforeEach(() => {
      error = new ListingPausedError()
    })

    it('should be recognised as a pause', () => {
      expect(isPausedError(error)).toBe(true)
    })

    it('should map to the purchases-paused message on a sale', () => {
      expect(friendlyError(error, FALLBACK, { sale: true })).toBe(t('errors.purchasesPaused'))
    })
  })

  describe('and the refusal is the OpenZeppelin revert string', () => {
    beforeEach(() => {
      error = { code: 'CALL_EXCEPTION', reason: 'Pausable: paused', message: 'execution reverted' }
    })

    it('should be recognised as a pause', () => {
      expect(isPausedError(error)).toBe(true)
    })
  })

  describe('and the refusal is the EnforcedPause custom error', () => {
    beforeEach(() => {
      error = new Error('execution reverted: EnforcedPause()')
    })

    it('should be recognised as a pause', () => {
      expect(isPausedError(error)).toBe(true)
    })
  })

  describe('and the relayer echoes the raw EnforcedPause selector', () => {
    beforeEach(() => {
      error = new Error('relayer rejected: 0xd93c0665')
    })

    it('should be recognised as a pause', () => {
      expect(isPausedError(error)).toBe(true)
    })
  })

  describe('and the flow is not a sale', () => {
    beforeEach(() => {
      error = new ListingPausedError()
    })

    it('should keep the caller’s own fallback', () => {
      expect(friendlyError(error, FALLBACK)).toBe(FALLBACK)
    })
  })
})

describe('when a purchase fails for an unrelated reason', () => {
  let error: unknown

  beforeEach(() => {
    error = new Error('execution reverted: invalid signature')
  })

  it('should not be recognised as a pause', () => {
    expect(isPausedError(error)).toBe(false)
  })
})
