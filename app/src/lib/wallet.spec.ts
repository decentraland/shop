import { describe, it, expect } from 'vitest'
import { ProviderType } from '@dcl/schemas'
import { isManagedWallet } from '~/lib/wallet'

describe('isManagedWallet', () => {
  describe('when there is no session', () => {
    it('should be false for null and undefined', () => {
      expect(isManagedWallet(null)).toBe(false)
      expect(isManagedWallet(undefined)).toBe(false)
    })
  })

  describe('when the wallet is managed (web2)', () => {
    it('should be true for Magic and Magic test', () => {
      expect(isManagedWallet({ providerType: ProviderType.MAGIC })).toBe(true)
      expect(isManagedWallet({ providerType: ProviderType.MAGIC_TEST })).toBe(true)
    })

    it('should treat an unknown / missing provider as managed (allowlist default)', () => {
      expect(isManagedWallet({ providerType: null })).toBe(true)
      expect(isManagedWallet({ providerType: 'some-future-provider' as ProviderType })).toBe(true)
    })
  })

  describe('when the wallet is self-custody', () => {
    it('should be false for injected and WalletConnect', () => {
      expect(isManagedWallet({ providerType: ProviderType.INJECTED })).toBe(false)
      expect(isManagedWallet({ providerType: ProviderType.WALLET_CONNECT_V2 })).toBe(false)
    })
  })
})
