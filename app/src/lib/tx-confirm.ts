import { ethers } from 'ethers'

import { readProvider } from '~/lib/authorizations'

/**
 * A relayed meta-transaction that MINED AND REVERTED. Nothing it was meant to do happened.
 */
export class MetaTxRevertedError extends Error {
  constructor(
    public readonly what: string,
    public readonly txHash: string
  ) {
    super(`${what} reverted on-chain`)
    this.name = 'MetaTxRevertedError'
  }
}

/**
 * No receipt inside the window. The transaction may STILL mine, so its effect is unknown — not failed.
 */
export class MetaTxPendingError extends Error {
  constructor(
    public readonly what: string,
    public readonly txHash: string,
    options?: { cause?: unknown }
  ) {
    super(`${what} was submitted but not confirmed in time`)
    this.name = 'MetaTxPendingError'
    // Set manually rather than through the Error options arg, so this does not need the ES2022 lib
    // target (same reason as SettlementPendingError in buy-gasless.ts).
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause
  }
}

/**
 * Wait for a relayed meta-transaction and RESOLVE ONLY IF IT SUCCEEDED.
 *
 * WHY THIS EXISTS. Five call sites did `await provider.waitForTransaction(txHash, 1, 120_000)` and then
 * carried on. That call resolves as soon as the transaction is mined and does NOT inspect
 * `receipt.status`, so a transaction that mined and REVERTED read as success. The direct (non-relayed)
 * paths never had the bug, because ethers' `tx.wait()` throws on a reverted receipt — so the two halves
 * of the same operation disagreed about what "done" means.
 *
 * What that cost: the listing-migration tool cancelled a MANA listing, the cancel reverted, the flow
 * recorded the listing as removed, every re-list attempt then hit `409 already an open order`, and the
 * seller was told "your old listing was removed" while it was still live in the old marketplace. The
 * same shape was reachable on a MANA purchase (`accept`), an NFT transfer (`transferFrom`) and a mint
 * (`issueTokens`) — each of which would have told someone an asset moved when it had not.
 *
 * Callers must treat BOTH failure modes as "not done", and they are separate because only one is
 * final: a revert means it will never happen, while pending means it still might, so a caller must not
 * take a compensating action (re-submitting, or telling the user to retry) on a pending outcome.
 */
export async function confirmMetaTx(txHash: string, what: string, opts?: { timeoutMs?: number }): Promise<string> {
  /**
   * Deliberately lib/authorizations' readProvider, even though that module imports THIS one.
   *
   * Review flagged the cycle as fragile and suggested inlining `new JsonRpcProvider(config.rpcUrl)`, as
   * buy-gasless does. Tried it and reverted: three specs stub `readProvider` to keep the relayed path
   * offline, and an inlined constructor bypasses that stub and reaches the real ethers provider — the
   * transfer spec then failed outright and the cancel spec silently took the direct fallback instead of
   * the relayed path it was asserting. The cycle is safe because both sides are function exports called
   * lazily, and it is the seam every test already mocks; a real fix means giving the provider its own
   * module, which is a wider refactor than this bug warrants.
   */
  const provider = readProvider()
  let receipt: ethers.providers.TransactionReceipt | null
  try {
    receipt = await provider.waitForTransaction(txHash, 1, opts?.timeoutMs ?? 120_000)
  } catch (err) {
    // Rejects on its own timeout, and can throw on a transient RPC hiccup: in flight, not failed.
    throw new MetaTxPendingError(what, txHash, { cause: err })
  }
  if (!receipt) throw new MetaTxPendingError(what, txHash)
  if (receipt.status === 0) throw new MetaTxRevertedError(what, txHash)
  return txHash
}

/**
 * Wait for a relayed transaction's EFFECT, not for the hash the relayer handed back.
 *
 * That hash is not a promise. The relayer resubmits with a higher fee when the network is busy — its own
 * logs count the attempts ("hash recovery … total_hashes=3") — so the first hash frequently never appears
 * on chain at all. Measured on production: a listing cancellation was relayed at 09:46, the returned hash
 * never existed, `waitForTransaction` on it gave up at 120s, the shop told the creator it had failed, and
 * the real transaction (a different hash) confirmed successfully at ~09:56. The creator re-signed six times
 * for something that had already worked.
 *
 * So this races two observations and takes whichever lands first:
 *
 *  - the receipt for `txHash`, which is a bonus when the first attempt happens to be the one that mines; and
 *  - `isDone()`, the caller's own question about the world ("is this listing still offered?"), which is true
 *    whatever hash won, and stays true if the effect had already happened before we started watching.
 *
 * A REVERTED receipt is still final and still throws — that one is not a race. A timeout throws
 * MetaTxPendingError, which means exactly what it says: it may yet land, so a caller must not describe it
 * as a failure.
 */
export async function confirmMetaTxByEffect(opts: {
  txHash: string
  what: string
  /** True once the world reflects the transaction. Must be cheap, idempotent and safe to call repeatedly. */
  isDone: () => Promise<boolean>
  /** How long to keep watching. Ten minutes: a fee-bumped relay on a congested Polygon takes that long. */
  timeoutMs?: number
  pollMs?: number
  /** Called after each unsuccessful round, so a caller can tell the user this is still in progress. */
  onWaiting?: (elapsedMs: number) => void
}): Promise<string> {
  const { txHash, what, isDone, timeoutMs = 10 * 60_000, onWaiting } = opts
  // Floored so a caller passing 0 (or a negative) cannot turn this into a tight loop hammering the RPC and
  // the caller's isDone read. 50ms keeps the unit tests fast while making a busy-loop impossible.
  const pollMs = Math.max(opts.pollMs ?? 5_000, 50)
  const provider = readProvider()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    // The effect first: it is the thing the caller actually promised the user, and it is hash-agnostic.
    try {
      if (await isDone()) return txHash
    } catch {
      // A failed read is not an answer — keep waiting rather than reporting either outcome.
    }

    // Then the receipt for the hash we were given. A revert here is final; anything else just means
    // "not this hash, not yet".
    try {
      const receipt = await provider.getTransactionReceipt(txHash)
      if (receipt) {
        if (receipt.status === 0) throw new MetaTxRevertedError(what, txHash)
        return txHash
      }
    } catch (err) {
      if (err instanceof MetaTxRevertedError) throw err
    }

    onWaiting?.(Date.now() - startedAt)
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }

  // One last look before giving up, so a confirmation that landed during the final sleep is not lost.
  try {
    if (await isDone()) return txHash
  } catch {
    // fall through to pending
  }
  throw new MetaTxPendingError(what, txHash)
}
