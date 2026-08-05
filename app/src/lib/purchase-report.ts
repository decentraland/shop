import type { AuthIdentity } from '@dcl/crypto'
import { reportIntentSubmission } from '~/lib/credits'
import { captureError } from '~/lib/monitoring'
import { useWallet } from '~/store/wallet'

/**
 * Reports the transaction a group's credits went out in, so a purchase that was attempted and reverted
 * can be told apart from a reservation nobody ever spent.
 *
 * Why the server cannot work this out for itself: the settlement hash it serves is derived from on-chain
 * consumption, and a `useCredits()` that reverts consumes nothing. So a failed purchase and an abandoned
 * buy modal both end up EXPIRED with no hash, and the Activity feed — which hides EXPIRED rows, correctly,
 * because every opened modal leaves one — hides the real failure along with the noise.
 *
 * FIRE AND FORGET, and that is the whole contract. This is bookkeeping for the buyer's history; it must
 * never be able to fail a purchase that is already on its way to the chain. Every outcome is swallowed:
 * no session, no identity, a rejected request, a server that does not have the endpoint yet. The cost of
 * losing one report is a failed purchase that stays hidden, which is exactly today's behaviour.
 *
 * Reads the session from the store rather than taking an identity, so the tx libraries that call it do not
 * have to thread auth through every checkout path. Same shape as `analytics` and `monitoring`.
 */
export function reportSubmittedTx(info: { txHash: string; salts: string[] }): void {
  if (info.salts.length === 0 || !info.txHash) return

  // Read the store defensively: a checkout can outlive the session it started in (a disconnect mid-flight),
  // and this must not be the thing that throws when it does.
  let identity: AuthIdentity | undefined
  try {
    identity = useWallet.getState().session?.identity
  } catch {
    return
  }
  if (!identity) return

  void reportIntentSubmission(identity, info.salts, info.txHash).catch(error => {
    captureError(error, { flow: 'report-submitted-tx' })
  })
}
