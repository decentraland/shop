import { createTreasuryConfigComponent } from '../../../../src/logic/config/component'
import { AMOY_ADDRESSES } from '../../../../src/logic/config/chains'
import { RefillStrategy, SignerMode, SwapMode } from '../../../../src/logic/config/types'
import { createConfigMock } from '../../../mocks'

const AMOY_BASE = {
  CHAIN_ID: '80002',
  NODE_ENV: 'development'
}

describe('when resolving treasury config on Amoy', () => {
  describe('and only the chain id is provided', () => {
    it('should fall back to baked-in Amoy addresses', async () => {
      const component = await createTreasuryConfigComponent({ config: createConfigMock(AMOY_BASE) })
      const cfg = component.get()
      expect(cfg.chainId).toBe(80002)
      expect(cfg.addresses.mana).toBe(AMOY_ADDRESSES.mana)
      expect(cfg.addresses.creditsManager).toBe(AMOY_ADDRESSES.creditsManager)
    })

    it('should default swap to mock and strategy to working-balance', async () => {
      const component = await createTreasuryConfigComponent({ config: createConfigMock(AMOY_BASE) })
      const cfg = component.get()
      expect(cfg.swapMode).toBe(SwapMode.MOCK)
      expect(cfg.refillStrategy).toBe(RefillStrategy.WORKING_BALANCE)
    })
  })

  describe('and an explicit address override is provided', () => {
    it('should prefer the env address over the default, lowercased', async () => {
      const component = await createTreasuryConfigComponent({
        config: createConfigMock({ ...AMOY_BASE, MANA_ADDRESS: '0xABCDEF0000000000000000000000000000000001' })
      })
      expect(component.get().addresses.mana).toBe('0xabcdef0000000000000000000000000000000001')
    })
  })
})

describe('when resolving treasury config on an unknown chain', () => {
  describe('and addresses are not provided', () => {
    it('should throw for the first missing address', async () => {
      await expect(
        createTreasuryConfigComponent({ config: createConfigMock({ CHAIN_ID: '137', NODE_ENV: 'development' }) })
      ).rejects.toThrow(/Missing required address config/)
    })
  })
})

describe('when selecting the signer mode', () => {
  describe('and dev signer is requested in a guarded dev environment', () => {
    it('should allow it', async () => {
      const component = await createTreasuryConfigComponent({
        config: createConfigMock({
          ...AMOY_BASE,
          SIGNER_MODE: 'dev',
          NODE_ENV: 'development',
          ALLOW_DEV_SIGNER: 'true'
        })
      })
      expect(component.get().signerMode).toBe(SignerMode.DEV)
    })
  })

  describe('and dev signer is requested in production', () => {
    it('should refuse to boot', async () => {
      await expect(
        createTreasuryConfigComponent({
          config: createConfigMock({
            ...AMOY_BASE,
            SIGNER_MODE: 'dev',
            NODE_ENV: 'production',
            ALLOW_DEV_SIGNER: 'true'
          })
        })
      ).rejects.toThrow(/SIGNER_MODE=dev is refused/)
    })
  })

  describe('and dev signer is requested without the explicit allow flag', () => {
    it('should refuse to boot', async () => {
      await expect(
        createTreasuryConfigComponent({
          config: createConfigMock({ ...AMOY_BASE, SIGNER_MODE: 'dev', NODE_ENV: 'development' })
        })
      ).rejects.toThrow(/SIGNER_MODE=dev is refused/)
    })
  })

  describe('and kms is requested', () => {
    it('should resolve to KMS mode', async () => {
      const component = await createTreasuryConfigComponent({
        config: createConfigMock({ ...AMOY_BASE, SIGNER_MODE: 'kms' })
      })
      expect(component.get().signerMode).toBe(SignerMode.KMS)
    })
  })
})

describe('when validating refill invariants', () => {
  describe('and the threshold exceeds the target', () => {
    it('should throw', async () => {
      await expect(
        createTreasuryConfigComponent({
          config: createConfigMock({ ...AMOY_BASE, REFILL_TARGET_MANA: '100', REFILL_THRESHOLD_MANA: '200' })
        })
      ).rejects.toThrow(/REFILL_THRESHOLD_MANA/)
    })
  })

  describe('and slippage is out of range', () => {
    it('should throw', async () => {
      await expect(
        createTreasuryConfigComponent({
          config: createConfigMock({ ...AMOY_BASE, SWAP_SLIPPAGE_BPS: '20000' })
        })
      ).rejects.toThrow(/SWAP_SLIPPAGE_BPS/)
    })
  })
})

describe('when configuring the DEX swap mode', () => {
  describe('and no aggregator URL is provided', () => {
    it('should throw', async () => {
      await expect(
        createTreasuryConfigComponent({
          config: createConfigMock({ ...AMOY_BASE, SWAP_MODE: 'dex' })
        })
      ).rejects.toThrow(/DEX_AGGREGATOR_URL/)
    })
  })

  describe('and an aggregator URL is provided', () => {
    it('should resolve to DEX mode', async () => {
      const component = await createTreasuryConfigComponent({
        config: createConfigMock({
          ...AMOY_BASE,
          SWAP_MODE: 'dex',
          DEX_AGGREGATOR_URL: 'https://agg.example.com'
        })
      })
      expect(component.get().swapMode).toBe(SwapMode.DEX)
    })
  })
})
