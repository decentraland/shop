import { ProviderType } from '@dcl/schemas'

/**
 * Wallet UX classification — the single source of truth for gating signature/transaction wording.
 *
 * "Self-custody" wallets (browser extension, WalletConnect, Coinbase, mobile MetaMask, Fortmatic)
 * surface a wallet prompt for every on-chain action: the user literally sees "confirm in your
 * wallet", multi-step approvals, gas, popups. Copy that mentions approvals / confirmations / signing
 * is accurate ONLY for them.
 *
 * Everything else — Magic (email/social login), thirdweb smart/embedded wallets, and any future or
 * unknown managed provider — is gasless / single-step / no popup. Those users must NEVER see wallet
 * jargon, so this is an ALLOWLIST: anything not explicitly self-custody is treated as managed. That
 * way a new provider can't accidentally leak MetaMask-style wording.
 *
 * Rule: never hardcode wallet-specific copy inline — gate it through `showsWalletConfirmations`.
 */
const SELF_CUSTODY_PROVIDERS: ReadonlySet<ProviderType> = new Set([
  ProviderType.INJECTED,
  ProviderType.METAMASK_MOBILE,
  ProviderType.FORTMATIC,
  ProviderType.WALLET_CONNECT,
  ProviderType.WALLET_CONNECT_V2,
  ProviderType.WALLET_LINK
])

/** True when the connected wallet pops a confirmation/approval/signature prompt per on-chain action. */
export function showsWalletConfirmations(providerType?: ProviderType | null): boolean {
  return !!providerType && SELF_CUSTODY_PROVIDERS.has(providerType)
}
