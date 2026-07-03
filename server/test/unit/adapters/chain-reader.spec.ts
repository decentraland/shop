import { BigNumber, utils } from 'ethers'

import { CHAINLINK_AGGREGATOR_ABI, ERC20_ABI } from '../../../src/adapters/chain/abis'
import { createChainReaderComponent } from '../../../src/adapters/chain/chain-reader'
import { createLogsMock, createTreasuryConfigMock } from '../../mocks'

const erc20 = new utils.Interface(ERC20_ABI)
const aggregator = new utils.Interface(CHAINLINK_AGGREGATOR_ABI)

/**
 * A minimal ethers v5 provider stub. ethers Contract read calls funnel through
 * provider.call(tx) and expect ABI-encoded return data; this stub inspects the selector
 * and returns encoded values, so we exercise the real ABI decoding path in chain-reader.
 */
function createProviderStub(handlers: {
  balanceOf?: BigNumber
  latestRoundData?: { answer: BigNumber; updatedAt: BigNumber }
}): any {
  return {
    // ethers v5 Contract/Wallet reject anything without this flag as "invalid provider".
    _isProvider: true,
    call: jest.fn(async (tx: { data: string }) => {
      const selector = tx.data.slice(0, 10)
      if (selector === erc20.getSighash('balanceOf')) {
        return erc20.encodeFunctionResult('balanceOf', [handlers.balanceOf ?? BigNumber.from(0)])
      }
      if (selector === aggregator.getSighash('latestRoundData')) {
        const r = handlers.latestRoundData ?? { answer: BigNumber.from(0), updatedAt: BigNumber.from(0) }
        return aggregator.encodeFunctionResult('latestRoundData', [
          BigNumber.from(1), // roundId
          r.answer,
          BigNumber.from(0), // startedAt
          r.updatedAt,
          BigNumber.from(1) // answeredInRound
        ])
      }
      throw new Error(`Unexpected selector ${selector}`)
    }),
    // ethers v5 Contract calls resolveName during send; reads don't, but stub it anyway.
    resolveName: jest.fn(async (name: string) => name),
    getNetwork: jest.fn(async () => ({ chainId: 80002, name: 'amoy' }))
  }
}

describe('when reading chain state', () => {
  describe('and querying an ERC-20 balance', () => {
    it('should decode the balance', async () => {
      const provider = createProviderStub({ balanceOf: BigNumber.from('123456789') })
      const reader = createChainReaderComponent({
        provider,
        treasuryConfig: createTreasuryConfigMock(),
        logs: createLogsMock()
      })
      const balance = await reader.getManaBalance('0x0000000000000000000000000000000000000001')
      expect(balance.toString()).toBe('123456789')
    })
  })

  describe('and reading a healthy oracle price', () => {
    it('should return the answer', async () => {
      const provider = createProviderStub({
        latestRoundData: {
          answer: BigNumber.from('26960000'),
          updatedAt: BigNumber.from(Math.floor(Date.now() / 1000))
        }
      })
      const reader = createChainReaderComponent({
        provider,
        treasuryConfig: createTreasuryConfigMock(),
        logs: createLogsMock()
      })
      const price = await reader.getOraclePrice()
      expect(price.toString()).toBe('26960000')
    })
  })

  describe('and the oracle price is stale', () => {
    it('should throw when the round is older than the max age', async () => {
      const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 3600
      const provider = createProviderStub({
        latestRoundData: { answer: BigNumber.from('26960000'), updatedAt: BigNumber.from(threeHoursAgo) }
      })
      const reader = createChainReaderComponent({
        provider,
        treasuryConfig: createTreasuryConfigMock(),
        logs: createLogsMock()
      })
      await expect(reader.getOraclePrice()).rejects.toThrow(/stale/)
    })
  })

  describe('and the oracle returns a non-positive price', () => {
    it('should throw rather than propagate a bad price', async () => {
      const provider = createProviderStub({
        latestRoundData: { answer: BigNumber.from(0), updatedAt: BigNumber.from(1_700_000_000) }
      })
      const reader = createChainReaderComponent({
        provider,
        treasuryConfig: createTreasuryConfigMock(),
        logs: createLogsMock()
      })
      await expect(reader.getOraclePrice()).rejects.toThrow(/non-positive/)
    })
  })

  describe('and the oracle round is incomplete', () => {
    it('should throw for a zero updatedAt (stale round)', async () => {
      const provider = createProviderStub({
        latestRoundData: { answer: BigNumber.from('26960000'), updatedAt: BigNumber.from(0) }
      })
      const reader = createChainReaderComponent({
        provider,
        treasuryConfig: createTreasuryConfigMock(),
        logs: createLogsMock()
      })
      await expect(reader.getOraclePrice()).rejects.toThrow(/incomplete/)
    })
  })
})
