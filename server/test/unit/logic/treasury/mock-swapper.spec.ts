import { BigNumber } from 'ethers'

import { createMockSwapper } from '../../../../src/logic/treasury/swap/mock-swapper'
import { usdcToMana, applySlippageFloor } from '../../../../src/logic/treasury/math'
import { IChainReaderComponent, ISwapperComponent, ITreasuryConfigComponent } from '../../../../src/types/components'
import { createChainReaderMock, createLogsMock, createTreasuryConfigMock } from '../../../mocks'

const PRICE_02696 = BigNumber.from('26960000')
const TEN_USDC = BigNumber.from('10000000') // $10, 6dp

let chainReader: jest.Mocked<IChainReaderComponent>
let treasuryConfig: ITreasuryConfigComponent
let swapper: ISwapperComponent

beforeEach(() => {
  chainReader = createChainReaderMock({ getOraclePrice: jest.fn().mockResolvedValue(PRICE_02696) })
  treasuryConfig = createTreasuryConfigMock({ slippageBps: 300 })
})

describe('when swapping USDC for MANA in mock mode', () => {
  describe('and there is no simulated adverse fill', () => {
    beforeEach(() => {
      swapper = createMockSwapper({ chainReader, treasuryConfig, logs: createLogsMock() })
    })

    it('should fill exactly at the oracle rate', async () => {
      const result = await swapper.swapUsdcForMana(TEN_USDC)
      expect(result.manaReceived.toString()).toBe(usdcToMana(TEN_USDC, PRICE_02696).toString())
      expect(result.usdcSpent.toString()).toBe(TEN_USDC.toString())
      expect(result.oraclePrice.toString()).toBe(PRICE_02696.toString())
    })

    it('should not produce an on-chain tx hash (simulation only)', async () => {
      const result = await swapper.swapUsdcForMana(TEN_USDC)
      expect(result.txHash).toBeNull()
    })
  })

  describe('and the simulated adverse fill is within the slippage tolerance', () => {
    beforeEach(() => {
      // simulated 200 bps adverse, tolerance 300 bps => acceptable
      swapper = createMockSwapper({
        chainReader,
        treasuryConfig,
        logs: createLogsMock(),
        simulatedSlippageBps: 200
      })
    })

    it('should return the reduced fill, still above the floor', async () => {
      const ideal = usdcToMana(TEN_USDC, PRICE_02696)
      const expected = applySlippageFloor(ideal, 200)
      const result = await swapper.swapUsdcForMana(TEN_USDC)
      expect(result.manaReceived.toString()).toBe(expected.toString())
    })
  })

  describe('and the simulated adverse fill breaches the slippage floor', () => {
    beforeEach(() => {
      // simulated 400 bps adverse, tolerance 300 bps => below floor
      swapper = createMockSwapper({
        chainReader,
        treasuryConfig,
        logs: createLogsMock(),
        simulatedSlippageBps: 400
      })
    })

    it('should throw rather than under-deliver', async () => {
      await expect(swapper.swapUsdcForMana(TEN_USDC)).rejects.toThrow(/below slippage floor/)
    })
  })

  describe('and the USDC amount is not positive', () => {
    beforeEach(() => {
      swapper = createMockSwapper({ chainReader, treasuryConfig, logs: createLogsMock() })
    })

    it('should reject a zero amount', async () => {
      await expect(swapper.swapUsdcForMana(BigNumber.from(0))).rejects.toThrow(/positive USDC amount/)
    })
  })
})
