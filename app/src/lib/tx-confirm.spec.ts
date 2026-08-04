import { describe, it, expect, vi, beforeEach } from 'vitest'

const { waitForTransaction } = vi.hoisted(() => ({ waitForTransaction: vi.fn() }))
vi.mock('~/lib/authorizations', () => ({ readProvider: () => ({ waitForTransaction }) }))

const { confirmMetaTx, MetaTxRevertedError, MetaTxPendingError } = await import('~/lib/tx-confirm')

/**
 * A relayed meta-transaction resolves through provider.waitForTransaction, which returns as soon as the
 * transaction is MINED and says nothing about whether it succeeded. Every caller here acts on the answer
 * — cancelling a listing, moving an NFT, minting, taking MANA — so "mined" must never be mistaken for
 * "worked". These cases pin the three outcomes apart.
 */
beforeEach(() => vi.clearAllMocks())

describe('confirmMetaTx', () => {
  it('resolves with the hash when the receipt says success', async () => {
    waitForTransaction.mockResolvedValue({ status: 1 })
    await expect(confirmMetaTx('0xhash', 'the cancel')).resolves.toBe('0xhash')
  })

  it('throws MetaTxRevertedError when the transaction mined and reverted', async () => {
    // The bug: status 0 IS a receipt, so waitForTransaction resolves and the caller carried on as if
    // the on-chain effect had happened.
    waitForTransaction.mockResolvedValue({ status: 0 })
    await expect(confirmMetaTx('0xhash', 'the cancel')).rejects.toBeInstanceOf(MetaTxRevertedError)
  })

  it('throws MetaTxPendingError when the wait times out, keeping the outcome unknown', async () => {
    waitForTransaction.mockRejectedValue(new Error('timeout exceeded'))
    const err = await confirmMetaTx('0xhash', 'the cancel').catch(e => e)
    expect(err).toBeInstanceOf(MetaTxPendingError)
    // Preserved for observability, and it must NOT read as a revert: pending may still mine, so a caller
    // must not take a compensating action on it.
    expect(err).not.toBeInstanceOf(MetaTxRevertedError)
    expect((err as { cause?: unknown }).cause).toBeInstanceOf(Error)
  })

  it('throws MetaTxPendingError when no receipt comes back at all', async () => {
    waitForTransaction.mockResolvedValue(null)
    await expect(confirmMetaTx('0xhash', 'the cancel')).rejects.toBeInstanceOf(MetaTxPendingError)
  })

  it('names the operation in the error, so a log says which step failed', async () => {
    waitForTransaction.mockResolvedValue({ status: 0 })
    await expect(confirmMetaTx('0xhash', 'the MANA purchase')).rejects.toThrow(/MANA purchase/)
  })
})
