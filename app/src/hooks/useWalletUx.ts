import { useWallet } from '~/store/wallet'
import { showsWalletConfirmations } from '~/lib/wallet-kind'

/**
 * Whether to show wallet-confirmation wording (approvals / signatures / "confirm in your wallet")
 * for the connected user. Gate ALL such copy behind this — see lib/wallet-kind.ts. Managed wallets
 * (Magic, thirdweb, …) get the web2 version instead.
 */
export function useShowsWalletConfirmations(): boolean {
  const { session } = useWallet()
  return showsWalletConfirmations(session?.providerType)
}
