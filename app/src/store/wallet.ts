import { create } from 'zustand'
import { logout, restoreSession, signInRedirect, type Session } from '~/lib/auth'

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
  signIn: () => signInRedirect(),
  disconnect: async () => {
    await logout()
    set({ session: null })
  },
  // Silent restore on load (reads connection + stored identity, no popup).
  restore: async () => {
    const session = await restoreSession()
    if (session) set({ session })
  }
}))
