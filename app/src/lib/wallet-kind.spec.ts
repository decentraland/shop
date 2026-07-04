import { describe, it, expect } from 'vitest'
import { ProviderType } from '@dcl/schemas'
import { showsWalletConfirmations } from '~/lib/wallet-kind'

describe('when deciding whether a wallet shows confirmation prompts', () => {
  it('should return false when no provider type is given', () => {
    expect(showsWalletConfirmations()).toBe(false)
    expect(showsWalletConfirmations(undefined)).toBe(false)
    expect(showsWalletConfirmations(null)).toBe(false)
  })

  it('should return true for every self-custody provider', () => {
    expect(showsWalletConfirmations(ProviderType.INJECTED)).toBe(true)
    expect(showsWalletConfirmations(ProviderType.METAMASK_MOBILE)).toBe(true)
    expect(showsWalletConfirmations(ProviderType.FORTMATIC)).toBe(true)
    expect(showsWalletConfirmations(ProviderType.WALLET_CONNECT)).toBe(true)
    expect(showsWalletConfirmations(ProviderType.WALLET_CONNECT_V2)).toBe(true)
    expect(showsWalletConfirmations(ProviderType.WALLET_LINK)).toBe(true)
  })

  it('should return false for managed providers that are gasless and popup-free', () => {
    expect(showsWalletConfirmations(ProviderType.MAGIC)).toBe(false)
    expect(showsWalletConfirmations(ProviderType.MAGIC_TEST)).toBe(false)
    expect(showsWalletConfirmations(ProviderType.THIRDWEB)).toBe(false)
    expect(showsWalletConfirmations(ProviderType.NETWORK)).toBe(false)
    expect(showsWalletConfirmations(ProviderType.AUTH_SERVER)).toBe(false)
  })

  it('should default any unknown or future provider to managed (allowlist behaviour)', () => {
    // Not in the self-custody allowlist -> treated as managed, so no wallet jargon.
    expect(showsWalletConfirmations('some_future_provider' as ProviderType)).toBe(false)
    expect(showsWalletConfirmations('' as ProviderType)).toBe(false)
  })
})
