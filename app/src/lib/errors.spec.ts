import { describe, it, expect } from 'vitest'
import { ChainId } from '@dcl/schemas'
import { friendlyError, isRejection, isSecondarySalesNotAllowedError, isSenderBalanceChangedError } from '~/lib/errors'
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

/**
 * THE TWO CREDITSMANAGER REFUSALS, READ OFF THE REVERT.
 *
 * Both are final: retrying changes nothing, so the generic "please try again" is not vague but wrong — it
 * has the buyer clicking a purchase that can never settle.
 *
 * They are detected from the revert SELECTOR rather than predicted before the purchase, and that is the
 * whole point of this block. An earlier version predicted the royalty case client-side by comparing the
 * buyer against the item's `creator`, and it was wrong in both directions: the contract pays the item's
 * `beneficiary` when one is set (`RoyaltiesManager.getRoyaltiesReceiver`), so a beneficiary who is not the
 * creator sailed through to the on-chain revert, while a creator whose item names someone else was refused
 * a purchase that would have settled. It also refused MANA-ONLY purchases, which never touch the
 * CreditsManager and so cannot trip the guard at all. A selector cannot be wrong in either direction.
 */
describe('friendlyError — the CreditsManager refusals', () => {
  // keccak256('SenderBalanceChanged()')[0:4] and keccak256('SecondarySalesNotAllowed()')[0:4].
  const SENDER_BALANCE_CHANGED = '0x55dd312d'
  const SECONDARY_NOT_ALLOWED = '0x112aa548'

  it('should explain a purchase that would pay the buyer, instead of offering a retry', () => {
    const revert = { data: SENDER_BALANCE_CHANGED }

    expect(friendlyError(revert, FALLBACK)).toMatch(/share of every resale/i)
    expect(friendlyError(revert, FALLBACK)).not.toBe(FALLBACK)
  })

  it('should explain that resales cannot be bought when the contract is not settling them', () => {
    // The rollout trap: the feature flag can be on while the CreditsManager's own `secondarySalesAllowed`
    // is still false, and then EVERY resale purchase reverts. Saying "try again later" is at least true.
    expect(friendlyError({ data: SECONDARY_NOT_ALLOWED }, FALLBACK)).toMatch(/resales/i)
  })

  it.each([
    ['ethers top-level data', { data: SENDER_BALANCE_CHANGED }],
    ['a nested provider error', { error: { data: SENDER_BALANCE_CHANGED } }],
    ['a doubly-nested provider error', { error: { error: { data: SENDER_BALANCE_CHANGED } } }],
    ['a JSON-RPC body string', { body: `{"error":{"data":"${SENDER_BALANCE_CHANGED}"}}` }],
    ['the message ethers builds', { message: `execution reverted (data="${SENDER_BALANCE_CHANGED}")` }]
  ])('should find the selector in %s', (_label, err) => {
    // Revert data sits at a different depth per provider, so the detector searches the shapes it is
    // actually found in rather than naming one.
    expect(isSenderBalanceChangedError(err)).toBe(true)
  })

  it('should match the selector case-insensitively', () => {
    expect(isSenderBalanceChangedError({ data: SENDER_BALANCE_CHANGED.toUpperCase() })).toBe(true)
  })

  it('should not confuse the two refusals for each other', () => {
    expect(isSenderBalanceChangedError({ data: SECONDARY_NOT_ALLOWED })).toBe(false)
    expect(isSecondarySalesNotAllowedError({ data: SENDER_BALANCE_CHANGED })).toBe(false)
  })

  it("should leave an ordinary failure on the caller's generic copy", () => {
    // A revert that mined carries no reason at all, and that has to stay generic rather than be guessed at.
    expect(friendlyError({ message: 'transaction failed' }, FALLBACK)).toBe(FALLBACK)
    expect(isSenderBalanceChangedError({})).toBe(false)
    expect(isSenderBalanceChangedError(new Error('boom'))).toBe(false)
  })
})
