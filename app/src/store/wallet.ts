import { create } from 'zustand'
import { logout, restoreSession, signInRedirect, type Session } from '~/lib/auth'
import { track, identify, signInMethod, markAddressSeen, reset as resetAnalytics } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { useFavorites } from '~/store/favorites'
import { useFollows } from '~/store/follows'

// Set right before the auth redirect so on return we can tell a fresh sign-in from a silent restore.
const SIGNING_IN_FLAG = 'shop:signing_in'

type WalletState = {
  session: Session | null
  connecting: boolean
  error: string | null
  signIn: () => void
  disconnect: () => Promise<void>
  restore: () => Promise<void>
}

export const useWallet = create<WalletState>(set => ({
  session: null,
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
    useFavorites.getState().reloadFor(null)
    useFollows.getState().reloadFor(null)
    set({ session: null })
  },
  // Silent restore on load (reads connection + stored identity, no popup).
  restore: async () => {
    let session: Session | null
    try {
      session = await restoreSession()
    } catch (e) {
      captureError(e, { flow: 'wallet', step: 'restore' })
      return
    }
    if (!session) return
    set({ session })
    // Load THIS account's client-side favorites/follows (namespaced per account).
    useFavorites.getState().reloadFor(session.address)
    useFollows.getState().reloadFor(session.address)
    identify(session.address, { sign_in_method: signInMethod(session.providerType) })
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
  }
}))
