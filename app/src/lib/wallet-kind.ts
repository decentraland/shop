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

/**
 * May this wallet be offered a rail where the WALLET itself pays the gas?
 *
 * Only a self-custody one can: a managed (web2) wallet holds no POL, so that rail reverts with
 * INSUFFICIENT_FUNDS after a prompt its owner cannot act on — and gas/network wording is exactly what these
 * users must never be shown (CONVENTIONS.md).
 *
 * Same allowlist as `showsWalletConfirmations`, deliberately named for the DECISION rather than the
 * mechanism. Three checkout surfaces asked this question by spelling out the confirmations check, and a
 * fourth (the cancel flow) forgot to ask it at all — a name for the question is what makes the omission
 * visible at the call site.
 */
export function canPayGasItself(providerType?: ProviderType | null): boolean {
  return showsWalletConfirmations(providerType)
}
