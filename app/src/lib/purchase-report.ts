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
 *
 * SWALLOWED IS NOT THE SAME AS UNREPORTED. Every giving-up path below is now named on the way out, because
 * without that this function is unfalsifiable: only 3 of 40 settled purchases carry a hash, the server logs
 * no request at all for the ones that are missing, and each of the four ways this can decline to send looked
 * identical from the outside — including a 200 whose `recorded: 0` means the salts matched nothing. The
 * reports keep the fire-and-forget contract: they observe, they never throw, and they never gate a purchase.
 */
function reportGaveUp(reason: string, context: Record<string, unknown> = {}): void {
  captureError(new Error(`report-submitted-tx gave up: ${reason}`), {
    flow: 'report-submitted-tx',
    reason,
    ...context
  })
}

export function reportSubmittedTx(info: { txHash: string; salts: string[] }): void {
  if (info.salts.length === 0 || !info.txHash) {
    reportGaveUp('nothing to report', { salts: info.salts.length, hasTxHash: !!info.txHash })
    return
  }

  // Read the store defensively: a checkout can outlive the session it started in (a disconnect mid-flight),
  // and this must not be the thing that throws when it does.
  let identity: AuthIdentity | undefined
  try {
    identity = useWallet.getState().session?.identity
  } catch (error) {
    captureError(error, { flow: 'report-submitted-tx', reason: 'wallet store threw' })
    return
  }
  if (!identity) {
    reportGaveUp('no identity in the wallet store', { salts: info.salts.length })
    return
  }

  void reportIntentSubmission(identity, info.salts, info.txHash)
    .then(recorded => {
      // A 200 that stamped nothing. The server treats it as "not my rows" and says so quietly; from here it
      // is indistinguishable from success, which is how a systematic salt or address mismatch would hide.
      if (recorded === 0) {
        reportGaveUp('server recorded 0 rows', { salts: info.salts.length })
      }
    })
    .catch(error => {
      captureError(error, { flow: 'report-submitted-tx', reason: 'request failed' })
    })
}
