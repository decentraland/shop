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
