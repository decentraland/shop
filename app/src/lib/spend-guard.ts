/**
 * "May these credits already be consumed on-chain?" — the one question that decides whether a failed purchase
 * may release its reservation.
 *
 * WHY THIS IS NOT A BOOLEAN. The first version of the PDP fix used a single `broadcastRef` per component, set
 * on broadcast and cleared on revert. Both of those are facts about ONE transaction, while the flag is read as
 * a fact about the CREDIT — and a credit can back more than one transaction:
 *
 *  - the modals leave their Confirm CTA enabled on the error phase, so a buyer can retry with the same
 *    reservation. Attempt 1 broadcasts and its outcome is never observed (a replaced transaction, an RPC
 *    drop); attempt 2 mines and reverts, because attempt 1 actually filled the trade. A single flag reads the
 *    second revert as "nothing was consumed" and releases a credit the first transaction spent.
 *  - the same shape is reachable without a retry, from two concurrent rails.
 *
 * So the state is kept PER CREDIT and PER TRANSACTION HASH: a credit is releasable only when every hash ever
 * broadcast for it is known to have reverted, and no submit for it is unaccounted for. A revert is the only
 * thing that clears a hash — nothing clears a credit.
 *
 * The asymmetry that justifies the pessimism: releasing a consumed credit corrupts the buyer's balance (it
 * rises by money already spent, the reconciler re-debits it once the squid indexes the consumption, and
 * anything bought in the gap drives it negative), while failing to release an unconsumed one only strands it
 * until the reservation's ~15 min TTL. When in doubt, do not release.
 */
export type SpendGuard = {
  /** A submit is in flight for this credit; until it settles, nothing about it can be ruled out. */
  submitStarted: (creditId: string) => void
  /** That submit is over — whatever was learned in the meantime is now all there is to go on. */
  submitFinished: (creditId: string) => void
  /** This credit's transaction went out. */
  broadcast: (creditId: string, txHash: string) => void
  /** That transaction mined and reverted, so it consumed nothing. */
  reverted: (txHash: string) => void
  /**
   * A submit for this credit failed in a way that cannot rule out a broadcast — no usable response, so no
   * hash to key on. Permanently unclearable for that credit, which is the only safe reading.
   */
  unobservable: (creditId: string) => void
  /** Whether a submit for this credit is still in flight. */
  isInFlight: (creditId: string) => boolean
  /**
   * The release decision: true means the credits MAY be consumed, so they must NOT be released. Callers that
   * can run while a submit is in flight (an unmount cleanup) must also check `isInFlight`.
   */
  mayBeConsumed: (creditId: string) => boolean
}

export function createSpendGuard(): SpendGuard {
  // creditId -> every hash broadcast for it. Never pruned: a hash that reverted is recorded as reverted
  // rather than forgotten, so a later attempt cannot resurrect it as "unresolved".
  const hashesByCredit = new Map<string, Set<string>>()
  const revertedHashes = new Set<string>()
  const unobservableCredits = new Set<string>()
  const inFlight = new Set<string>()

  return {
    submitStarted: creditId => {
      inFlight.add(creditId)
    },
    submitFinished: creditId => {
      inFlight.delete(creditId)
    },
    broadcast: (creditId, txHash) => {
      const hashes = hashesByCredit.get(creditId)
      if (hashes) hashes.add(txHash)
      else hashesByCredit.set(creditId, new Set([txHash]))
    },
    reverted: txHash => {
      revertedHashes.add(txHash)
    },
    unobservable: creditId => {
      unobservableCredits.add(creditId)
    },
    isInFlight: creditId => inFlight.has(creditId),
    mayBeConsumed: creditId => {
      if (unobservableCredits.has(creditId)) return true
      const hashes = hashesByCredit.get(creditId)
      if (!hashes) return false
      // Any hash whose revert was never observed keeps the credit untouchable — including a hash from an
      // earlier attempt, which is exactly the case a single flag got wrong.
      for (const hash of hashes) {
        if (!revertedHashes.has(hash)) return true
      }
      return false
    }
  }
}
