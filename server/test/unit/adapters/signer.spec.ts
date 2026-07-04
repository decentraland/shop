import { BigNumber, Wallet } from 'ethers'

import { createTreasurySignerComponent } from '../../../src/adapters/signer/component'
import { SignerMode } from '../../../src/logic/config/types'
import { createConfigMock, createLogsMock, createTreasuryConfigMock } from '../../mocks'

// A deterministic well-known hardhat throwaway key (no value at risk).
const DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const DEV_ADDRESS = new Wallet(DEV_KEY).address

// A fake provider — the dev signer only needs it to construct a Wallet; no network is hit.
// ethers v5 validates provider identity via _isProvider, so the stub must carry it.
const fakeProvider = { _isProvider: true } as any

describe('when selecting the treasury signer', () => {
  describe('and dev mode is requested in a guarded dev environment', () => {
    it('should construct the dev signer with the local key', async () => {
      const signer = await createTreasurySignerComponent({
        config: createConfigMock({
          NODE_ENV: 'development',
          ALLOW_DEV_SIGNER: 'true',
          DEV_TREASURY_PRIVATE_KEY: DEV_KEY
        }),
        logs: createLogsMock(),
        provider: fakeProvider,
        treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.DEV })
      })
      expect((await signer.getAddress()).toLowerCase()).toBe(DEV_ADDRESS.toLowerCase())
    })
  })

  describe('and dev mode is requested in production', () => {
    it('should refuse to construct the dev signer', async () => {
      await expect(
        createTreasurySignerComponent({
          config: createConfigMock({
            NODE_ENV: 'production',
            ALLOW_DEV_SIGNER: 'true',
            DEV_TREASURY_PRIVATE_KEY: DEV_KEY
          }),
          logs: createLogsMock(),
          provider: fakeProvider,
          treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.DEV })
        })
      ).rejects.toThrow(/Refusing to construct the dev treasury signer/)
    })
  })

  describe('and dev mode is requested without the allow flag', () => {
    it('should refuse to construct the dev signer', async () => {
      await expect(
        createTreasurySignerComponent({
          config: createConfigMock({ NODE_ENV: 'development', DEV_TREASURY_PRIVATE_KEY: DEV_KEY }),
          logs: createLogsMock(),
          provider: fakeProvider,
          treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.DEV })
        })
      ).rejects.toThrow(/Refusing to construct the dev treasury signer/)
    })
  })

  describe('and KMS mode is requested without a factory', () => {
    it('should refuse to boot without real custody', async () => {
      await expect(
        createTreasurySignerComponent({
          config: createConfigMock({ KMS_KEY_ID: 'arn:aws:kms:us-east-1:0:key/example', AWS_REGION: 'us-east-1' }),
          logs: createLogsMock(),
          provider: fakeProvider,
          treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.KMS })
        })
      ).rejects.toThrow(/requires a KmsSignerFactory/)
    })
  })

  describe('and KMS mode is requested with a factory', () => {
    it('should construct the KMS signer and expose its address', async () => {
      const fakeKmsSigner = {
        getAddress: jest.fn().mockResolvedValue('0x000000000000000000000000000000000000kms1'),
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xkmshash' })
      } as any
      const signer = await createTreasurySignerComponent({
        config: createConfigMock({ KMS_KEY_ID: 'arn:aws:kms:us-east-1:0:key/example', AWS_REGION: 'us-east-1' }),
        logs: createLogsMock(),
        provider: fakeProvider,
        treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.KMS }),
        kmsSignerFactory: () => fakeKmsSigner
      })
      expect(await signer.getAddress()).toBe('0x000000000000000000000000000000000000kms1')
      const sent = await signer.sendTransaction({ to: '0xabc' })
      expect(sent.hash).toBe('0xkmshash')
      expect(fakeKmsSigner.sendTransaction).toHaveBeenCalled()
    })
  })

  describe('and KMS mode is requested with a short key id and no region override', () => {
    it('should still construct (key id masked in logs, region defaulted)', async () => {
      const fakeKmsSigner = {
        getAddress: jest.fn().mockResolvedValue('0x00000000000000000000000000000000kmsshort'),
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xshort' })
      } as any
      const signer = await createTreasurySignerComponent({
        // KMS_KEY_ID <= 8 chars exercises the '***' masking branch; AWS_REGION omitted -> default.
        config: createConfigMock({ KMS_KEY_ID: 'short' }),
        logs: createLogsMock(),
        provider: fakeProvider,
        treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.KMS }),
        kmsSignerFactory: () => fakeKmsSigner
      })
      expect(await signer.getAddress()).toBe('0x00000000000000000000000000000000kmsshort')
    })
  })

  describe('and the dev signer broadcasts a transaction', () => {
    it('should send { to, data, value } via the wallet and return the tx hash', async () => {
      // Stub the wallet broadcast so no network is hit; the dev signer only forwards to it.
      const spy = jest.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({ hash: '0xdevbroadcast' } as any)
      try {
        const signer = await createTreasurySignerComponent({
          config: createConfigMock({
            NODE_ENV: 'development',
            ALLOW_DEV_SIGNER: 'true',
            DEV_TREASURY_PRIVATE_KEY: DEV_KEY
          }),
          logs: createLogsMock(),
          provider: fakeProvider,
          treasuryConfig: createTreasuryConfigMock({ signerMode: SignerMode.DEV })
        })

        const sent = await signer.sendTransaction({ to: '0xdead', data: '0xbeef', value: BigNumber.from(1) })

        expect(sent.hash).toBe('0xdevbroadcast')
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: '0xdead', data: '0xbeef' }))
      } finally {
        spy.mockRestore()
      }
    })
  })
})
