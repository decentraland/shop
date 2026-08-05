import { describe, it, expect, vi, beforeEach } from 'vitest'

const { waitForTransaction } = vi.hoisted(() => ({ waitForTransaction: vi.fn() }))
// readProvider is the seam the other relayed-path specs stub too, which is why the module keeps using it.
const { getTransactionReceipt } = vi.hoisted(() => ({ getTransactionReceipt: vi.fn() }))
vi.mock('~/lib/authorizations', () => ({ readProvider: () => ({ waitForTransaction, getTransactionReceipt }) }))

const { confirmMetaTx, confirmMetaTxByEffect, MetaTxRevertedError, MetaTxPendingError } =
  await import('~/lib/tx-confirm')

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

/**
 * WAITING ON THE EFFECT INSTEAD OF THE HASH.
 *
 * The relayer bumps the fee and resubmits, so the hash it returned is often not the one that mines. Measured
 * on production: a cancellation was relayed, its hash never appeared, the 120s wait on it "failed", and the
 * real transaction confirmed eight minutes later under a different hash — after the seller had been told it
 * did not work and re-signed five more times.
 */
describe('confirmMetaTxByEffect', () => {
  const noReceipt = () => {
    getTransactionReceipt.mockResolvedValue(null)
  }

  it('resolves as soon as the effect is visible, even though the hash never mines', async () => {
    noReceipt()
    const isDone = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)

    await expect(
      confirmMetaTxByEffect({ txHash: '0xghost', what: 'the cancel', isDone, pollMs: 1, timeoutMs: 500 })
    ).resolves.toBe('0xghost')
    expect(getTransactionReceipt).toHaveBeenCalled()
  })

  it('resolves when the effect had already happened before we started watching', async () => {
    noReceipt()
    await expect(
      confirmMetaTxByEffect({
        txHash: '0xghost',
        what: 'the cancel',
        isDone: vi.fn().mockResolvedValue(true),
        pollMs: 1,
        timeoutMs: 500
      })
    ).resolves.toBe('0xghost')
  })

  it('still takes the receipt when that is what arrives first', async () => {
    getTransactionReceipt.mockResolvedValue({ status: 1 })
    await expect(
      confirmMetaTxByEffect({
        txHash: '0xhash',
        what: 'the cancel',
        isDone: vi.fn().mockResolvedValue(false),
        pollMs: 1,
        timeoutMs: 500
      })
    ).resolves.toBe('0xhash')
  })

  // A revert is not a race: that hash will never do anything, so it is reported immediately.
  it('throws MetaTxRevertedError on a reverted receipt', async () => {
    getTransactionReceipt.mockResolvedValue({ status: 0 })
    await expect(
      confirmMetaTxByEffect({
        txHash: '0xhash',
        what: 'the cancel',
        isDone: vi.fn().mockResolvedValue(false),
        pollMs: 1,
        timeoutMs: 500
      })
    ).rejects.toBeInstanceOf(MetaTxRevertedError)
  })

  it('keeps waiting through a failing effect read rather than calling it either way', async () => {
    noReceipt()
    const isDone = vi.fn().mockRejectedValueOnce(new Error('feed down')).mockResolvedValue(true)

    await expect(
      confirmMetaTxByEffect({ txHash: '0xghost', what: 'the cancel', isDone, pollMs: 1, timeoutMs: 500 })
    ).resolves.toBe('0xghost')
    expect(isDone).toHaveBeenCalledTimes(2)
  })

  it('times out as PENDING, not as failed — it may still land', async () => {
    noReceipt()
    await expect(
      confirmMetaTxByEffect({
        txHash: '0xghost',
        what: 'the cancel',
        isDone: vi.fn().mockResolvedValue(false),
        pollMs: 1,
        timeoutMs: 20
      })
    ).rejects.toBeInstanceOf(MetaTxPendingError)
  })

  it('reports progress so the caller can say it is still working', async () => {
    noReceipt()
    const onWaiting = vi.fn()
    await confirmMetaTxByEffect({
      txHash: '0xghost',
      what: 'the cancel',
      isDone: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
      pollMs: 1,
      timeoutMs: 500,
      onWaiting
    })
    expect(onWaiting).toHaveBeenCalled()
  })
})
