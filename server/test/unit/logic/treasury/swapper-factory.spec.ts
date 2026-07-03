import { BigNumber } from 'ethers'

import { SwapMode } from '../../../../src/logic/config/types'
import { createSwapperComponent } from '../../../../src/logic/treasury/swap/component'
import { usdcToMana } from '../../../../src/logic/treasury/math'
import {
  createChainReaderMock,
  createLogsMock,
  createSignerMock,
  createTreasuryConfigMock
} from '../../../mocks'

const PRICE_1USD = BigNumber.from('100000000')
const fetchMock = { fetch: jest.fn() } as any

describe('when selecting the swapper implementation', () => {
  describe('and the mode is mock', () => {
    it('should build a swapper that fills at the oracle rate without a tx hash', async () => {
      const chainReader = createChainReaderMock({ getOraclePrice: jest.fn().mockResolvedValue(PRICE_1USD) })
      const swapper = createSwapperComponent({
        chainReader,
        treasuryConfig: createTreasuryConfigMock({ swapMode: SwapMode.MOCK }),
        signer: createSignerMock(),
        fetch: fetchMock,
        logs: createLogsMock()
      })
      const result = await swapper.swapUsdcForMana(BigNumber.from('1000000'))
      expect(result.txHash).toBeNull()
      expect(result.manaReceived.toString()).toBe(usdcToMana(BigNumber.from('1000000'), PRICE_1USD).toString())
    })
  })

  describe('and the mode is dex', () => {
    it('should build the DEX swapper (which needs the aggregator wired to actually fill)', async () => {
      const chainReader = createChainReaderMock({ getOraclePrice: jest.fn().mockResolvedValue(PRICE_1USD) })
      // The aggregator fetch is not stubbed here, so a real swap attempt fails — this test
      // only asserts the factory returns the DEX impl (mock would have returned a fill).
      fetchMock.fetch.mockResolvedValue({ ok: false, status: 500 })
      const swapper = createSwapperComponent({
        chainReader,
        treasuryConfig: createTreasuryConfigMock({ swapMode: SwapMode.DEX, dexAggregatorUrl: 'https://agg.example.com' }),
        signer: createSignerMock(),
        fetch: fetchMock,
        logs: createLogsMock()
      })
      await expect(swapper.swapUsdcForMana(BigNumber.from('1000000'))).rejects.toThrow(/Aggregator quote failed/)
    })
  })
})
