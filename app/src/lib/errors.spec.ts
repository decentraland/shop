import { describe, it, expect } from 'vitest'
import { ChainId } from '@dcl/schemas'
import { friendlyError, isRejection } from '~/lib/errors'
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
