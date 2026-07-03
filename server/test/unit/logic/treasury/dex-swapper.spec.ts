import { BigNumber } from 'ethers'

import { createDexSwapper } from '../../../../src/logic/treasury/swap/dex-swapper'
import { usdcToMana, applySlippageFloor } from '../../../../src/logic/treasury/math'
import { IChainReaderComponent, ITreasurySignerComponent } from '../../../../src/types/components'
import {
  createChainReaderMock,
  createLogsMock,
  createSignerMock,
  createTreasuryConfigMock
} from '../../../mocks'

const PRICE_1USD = BigNumber.from('100000000')
const ONE_USDC = BigNumber.from('1000000')

let chainReader: jest.Mocked<IChainReaderComponent>
let signer: jest.Mocked<ITreasurySignerComponent>
let fetchMock: { fetch: jest.Mock }

function buildSwapper() {
  return createDexSwapper({
    chainReader,
    treasuryConfig: createTreasuryConfigMock({ slippageBps: 300, dexAggregatorUrl: 'https://agg.example.com' }),
    signer,
    fetch: fetchMock as any,
    logs: createLogsMock()
  })
}

function mockQuote(buyAmount: BigNumber) {
  fetchMock.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      buyAmount: buyAmount.toString(),
      to: '0xaggregator',
      data: '0xswapcalldata',
      value: '0',
      allowanceTarget: '0xallowance'
    })
  })
}

beforeEach(() => {
  chainReader = createChainReaderMock({ getOraclePrice: jest.fn().mockResolvedValue(PRICE_1USD) })
  signer = createSignerMock({ sendTransaction: jest.fn().mockResolvedValue({ hash: '0xdexhash' }) })
  fetchMock = { fetch: jest.fn() }
})

describe('when swapping via the DEX aggregator', () => {
  describe('and the quote clears the oracle floor', () => {
    beforeEach(() => {
      // Quote exactly at the ideal oracle amount, which is above the slippage floor.
      mockQuote(usdcToMana(ONE_USDC, PRICE_1USD))
    })

    it('should broadcast the aggregator calldata via the signer and return the fill', async () => {
      const swapper = buildSwapper()
      const result = await swapper.swapUsdcForMana(ONE_USDC)
      expect(signer.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0xaggregator', data: '0xswapcalldata' })
      )
      expect(result.txHash).toBe('0xdexhash')
      expect(result.manaReceived.toString()).toBe(usdcToMana(ONE_USDC, PRICE_1USD).toString())
    })
  })

  describe('and the quote is below the oracle slippage floor', () => {
    beforeEach(() => {
      // Quote 5% below ideal, floor is 3% => rejected.
      mockQuote(applySlippageFloor(usdcToMana(ONE_USDC, PRICE_1USD), 500))
    })

    it('should throw and not broadcast', async () => {
      const swapper = buildSwapper()
      await expect(swapper.swapUsdcForMana(ONE_USDC)).rejects.toThrow(/below oracle slippage floor/)
      expect(signer.sendTransaction).not.toHaveBeenCalled()
    })
  })

  describe('and the aggregator request fails', () => {
    beforeEach(() => {
      fetchMock.fetch.mockResolvedValue({ ok: false, status: 502 })
    })

    it('should throw', async () => {
      const swapper = buildSwapper()
      await expect(swapper.swapUsdcForMana(ONE_USDC)).rejects.toThrow(/Aggregator quote failed with status 502/)
    })
  })

  describe('and the amount is not positive', () => {
    it('should reject before calling the aggregator', async () => {
      const swapper = buildSwapper()
      await expect(swapper.swapUsdcForMana(BigNumber.from(0))).rejects.toThrow(/positive USDC amount/)
      expect(fetchMock.fetch).not.toHaveBeenCalled()
    })
  })
})
