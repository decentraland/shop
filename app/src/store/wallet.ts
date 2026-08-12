import { create } from 'zustand'
import { logout, restoreSession, signInRedirect, type Session } from '~/lib/auth'
import { track, identify, signInMethod, markAddressSeen, reset as resetAnalytics } from '~/lib/analytics'
import { captureError, setMonitoringUser } from '~/lib/monitoring'
import { useFavorites } from '~/store/favorites'
import { useFollows } from '~/store/follows'
import { useCart } from '~/store/cart'

// Set right before the auth redirect so on return we can tell a fresh sign-in from a silent restore.
const SIGNING_IN_FLAG = 'shop:signing_in'

/**
 * The IN-FLIGHT silent restore, so concurrent callers share one pass rather than racing.
 *
 * Cleared once it settles, deliberately: this dedupes overlapping calls, it is not a run-once latch. A latch
 * would outlive the thing it guards — the curtain unmounts and remounts the navbar, and a spec runs many
 * restores against different mocks — and both would then silently reuse the first pass forever.
 */
let restoring: Promise<void> | undefined

type WalletState = {
  session: Session | null
  /**
   * Has the silent restore finished, whatever its outcome?
   *
   * `session === null` is ambiguous on its own: it means BOTH "this visitor has no wallet" and "we have
   * not looked yet". Anything that treats the absence of a wallet as a decision — the pre-launch curtain
   * — has to be able to tell those apart, or it acts on the second while meaning the first and flickers.
   */
  restored: boolean
  connecting: boolean
  error: string | null
  signIn: () => void
  disconnect: () => Promise<void>
  restore: () => Promise<void>
}

export const useWallet = create<WalletState>(set => ({
  session: null,
  restored: false,
  connecting: false,
  error: null,
  // Redirect to the auth app; the user picks wallet / Magic / thirdweb there.
  signIn: () => {
    try {
      sessionStorage.setItem(SIGNING_IN_FLAG, '1')
    } catch {
      // ignore storage failures — we just lose the fresh-vs-restore distinction
    }
    signInRedirect()
  },
  disconnect: async () => {
    track('Shop Signed Out')
    try {
      await logout()
    } catch (e) {
      captureError(e, { flow: 'wallet', step: 'disconnect' })
    }
    // Drop the previous account's client-side identity + state so a different account on this
    // device never inherits it: clear the Segment identity and swap favorites/follows to the
    // anonymous bucket.
    resetAnalytics()
    // Detach the account from error reports too. This is not symmetry for its own sake: the Sentry user is
    // global and outlives the session, so skipping it would attribute the next visitor's errors — anonymous
    // or a different account on this device — to whoever signed out last.
    setMonitoringUser(null)
    useFavorites.getState().reloadFor(null)
    useFollows.getState().reloadFor(null)
    useCart.getState().reloadFor(null)
    set({ session: null })
  },
  // Silent restore on load (reads connection + stored identity, no popup).
  //
  // Deduped through a module-level in-flight promise, because several mount points ask for it (the navbar,
  // My Assets, the import tool, and App itself) and a second call would re-read the identity and re-emit
  // the analytics identify for the same session. Callers can therefore fire it freely.
  restore: async () => {
    if (restoring) return restoring
    restoring = (async () => {
      let session: Session | null
      try {
        session = await restoreSession()
      } catch (e) {
        captureError(e, { flow: 'wallet', step: 'restore' })
        // `restored` is set on EVERY exit path, including the failures. A restore that threw has still
        // answered the only question the flag is asked — "do we know yet?" — and leaving it false would
        // hang anything waiting on it forever.
        set({ restored: true })
        return
      }
      if (!session) {
        set({ restored: true })
        return
      }
      set({ session, restored: true })
      // Swap favorites to this account's server-backed list and follows to its local bucket, and hand the
      // persisted cart over to this buyer — it is emptied if it belonged to a different one.
      useFavorites.getState().reloadFor(session.address, session.identity)
      useFollows.getState().reloadFor(session.address)
      useCart.getState().reloadFor(session.address)
      identify(session.address, { sign_in_method: signInMethod(session.providerType) })
      // Same address, same moment, as the Segment identify above — an error report that cannot say WHICH
      // account hit it can only be counted, never followed. Without this the reports carry the visitor's
      // IP, which over-counts one person across a rotating mobile address and under-counts a shared one,
      // and shares no key with the purchase history, the funnel or the chain.
      setMonitoringUser(session.address)
      // Only emit the funnel event for an actual sign-in, not every silent restore.
      let fresh = false
      try {
        fresh = sessionStorage.getItem(SIGNING_IN_FLAG) === '1'
        if (fresh) sessionStorage.removeItem(SIGNING_IN_FLAG)
      } catch {
        // ignore
      }
      if (fresh) {
        track('Shop Signed In', {
          method: signInMethod(session.providerType),
          is_new_user: markAddressSeen(session.address)
        })
      }
    })().finally(() => {
      restoring = undefined
    })
    return restoring
  }
}))
