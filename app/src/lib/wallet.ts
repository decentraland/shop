import { ProviderType } from '@dcl/schemas'
import { showsWalletConfirmations } from '~/lib/wallet-kind'

// A managed (web2) wallet — Magic email/social login, thirdweb embedded, or any future managed
// provider — signs transparently (no popup, gasless, single step). Self-custody wallets (MetaMask,
// WalletConnect, Coinbase…) pop a confirmation for every on-chain action.
//
// This is the inverse of `showsWalletConfirmations`, which is the single source of truth for the
// self-custody allowlist (wallet-kind.ts). Deriving it here — rather than hardcoding a
// `providerType === MAGIC` check inline (as ItemDetail/SellModal used to) — keeps the classification
// consistent across the app and means a new managed provider is treated as managed by default (it
// never leaks MetaMask-style "authorize" / "confirm in wallet" wording to a web2 user).
export function isManagedWallet(session: { providerType?: ProviderType | null } | null | undefined): boolean {
  return !!session && !showsWalletConfirmations(session.providerType)
}
