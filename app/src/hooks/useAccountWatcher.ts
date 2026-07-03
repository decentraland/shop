import { useEffect } from 'react'
import { ProviderType } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'

// EIP-1193 events we care about from an injected wallet (MetaMask, Rabby, ...).
type Eip1193 = {
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
}

// When the user switches (or disconnects) the account in an injected wallet, everything already
// fetched — credit balance, owned items, purchases, profile, plus any Zustand state — belongs to the
// PREVIOUS account. Rather than trying to surgically purge every store + the React Query cache (easy
// to miss one and leak the old account's data), we do the bulletproof thing: a full page reload. That
// re-runs the silent session restore for the now-active account and starts every fetch from scratch.
//
// Only injected wallets emit accountsChanged; Magic/thirdweb sessions don't switch accounts this way.
export function useAccountWatcher() {
  const session = useWallet(s => s.session)

  useEffect(() => {
    if (!session || session.providerType !== ProviderType.INJECTED) return

    const provider = session.web3Provider.provider as Eip1193 | undefined
    if (!provider?.on || !provider.removeListener) return

    const current = session.address.toLowerCase()

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[] | undefined) ?? []
      const next = accounts[0]?.toLowerCase()
      // Ignore spurious re-emits of the same account; reload on a real switch or a disconnect.
      if (next === current) return
      window.location.reload()
    }

    provider.on('accountsChanged', onAccountsChanged)
    return () => provider.removeListener?.('accountsChanged', onAccountsChanged)
  }, [session])
}
