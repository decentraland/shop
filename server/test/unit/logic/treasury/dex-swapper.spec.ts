import { BigNumber } from 'ethers'

import { createDexSwapper } from '../../../../src/logic/treasury/swap/dex-swapper'
import { AMOY_ADDRESSES } from '../../../../src/logic/config/chains'
import { usdcToMana, applySlippageFloor } from '../../../../src/logic/treasury/math'
import { IChainReaderComponent, ITreasurySignerComponent } from '../../../../src/types/components'
import { createChainReaderMock, createLogsMock, createSignerMock, createTreasuryConfigMock } from '../../../mocks'

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
      // The reported fill is the ACTUAL treasury MANA balance delta, not the quote: 0 before,
      // the ideal amount after the swap.
      chainReader.getManaBalance
        .mockResolvedValueOnce(BigNumber.from(0))
        .mockResolvedValueOnce(usdcToMana(ONE_USDC, PRICE_1USD))
    })

    it('should broadcast the aggregator calldata via the signer and return the actual fill delta', async () => {
      const swapper = buildSwapper()
      const result = await swapper.swapUsdcForMana(ONE_USDC)
      expect(signer.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0xaggregator', data: '0xswapcalldata' })
      )
      expect(result.txHash).toBe('0xdexhash')
      expect(result.manaReceived.toString()).toBe(usdcToMana(ONE_USDC, PRICE_1USD).toString())
    })
  })

  describe('and the quote clears the floor but the ACTUAL on-chain fill under-delivers', () => {
    beforeEach(() => {
      // Quote is healthy (at ideal), so the pre-swap check passes and the swap broadcasts...
      mockQuote(usdcToMana(ONE_USDC, PRICE_1USD))
      // ...but the real balance delta comes in 5% under ideal — below the 3% floor.
      chainReader.getManaBalance
        .mockResolvedValueOnce(BigNumber.from(0))
        .mockResolvedValueOnce(applySlippageFloor(usdcToMana(ONE_USDC, PRICE_1USD), 500))
    })

    it('should throw on the post-swap delta check so the refill never books an inflated fill', async () => {
      const swapper = buildSwapper()
      await expect(swapper.swapUsdcForMana(ONE_USDC)).rejects.toThrow(/under-delivered: actual fill/)
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

  describe('and the DEX aggregator URL is not configured', () => {
    it('should throw before fetching a quote', async () => {
      const swapper = createDexSwapper({
        chainReader,
        treasuryConfig: createTreasuryConfigMock({ slippageBps: 300, dexAggregatorUrl: undefined }),
        signer,
        fetch: fetchMock as any,
        logs: createLogsMock()
      })
      await expect(swapper.swapUsdcForMana(ONE_USDC)).rejects.toThrow(/DEX aggregator URL is not configured/)
      expect(fetchMock.fetch).not.toHaveBeenCalled()
    })
  })

  describe('and the USDC allowance is insufficient', () => {
    // A valid checksummable address is required because approve() calldata is abi-encoded.
    const ALLOWANCE_TARGET = '0x1111111111111111111111111111111111111111'

    beforeEach(() => {
      // Zero allowance forces an on-chain approve before the swap can pull USDC.
      chainReader = createChainReaderMock({
        getOraclePrice: jest.fn().mockResolvedValue(PRICE_1USD),
        getUsdcAllowance: jest.fn().mockResolvedValue(BigNumber.from(0))
      })
      // Balance delta around the swap: 0 before, ideal fill after (clears the floor).
      chainReader.getManaBalance
        .mockResolvedValueOnce(BigNumber.from(0))
        .mockResolvedValueOnce(usdcToMana(ONE_USDC, PRICE_1USD))
      fetchMock.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          buyAmount: usdcToMana(ONE_USDC, PRICE_1USD).toString(),
          to: '0xaggregator',
          data: '0xswapcalldata',
          value: '0',
          allowanceTarget: ALLOWANCE_TARGET
        })
      })
    })

    it('should approve the USDC token for the allowanceTarget before broadcasting the swap', async () => {
      const swapper = buildSwapper()
      await swapper.swapUsdcForMana(ONE_USDC)

      expect(signer.sendTransaction).toHaveBeenCalledTimes(2)
      const [approveCall, swapCall] = signer.sendTransaction.mock.calls.map((c) => c[0])
      // First tx = ERC-20 approve(spender, amount) to the USDC token contract.
      expect(approveCall.to).toBe(AMOY_ADDRESSES.usdc)
      expect(approveCall.data?.startsWith('0x095ea7b3')).toBe(true) // approve(address,uint256) selector
      // Second tx = the aggregator swap calldata.
      expect(swapCall.to).toBe('0xaggregator')
    })
  })
})
