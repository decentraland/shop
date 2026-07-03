import { BigNumber } from 'ethers'

import { ISwapperComponent } from '../../src/types/components'

export function createSwapperMock(
  overrides: Partial<jest.Mocked<ISwapperComponent>> = {}
): jest.Mocked<ISwapperComponent> {
  return {
    swapUsdcForMana: jest.fn().mockResolvedValue({
      usdcSpent: BigNumber.from(0),
      manaReceived: BigNumber.from(0),
      oraclePrice: BigNumber.from(0),
      txHash: null
    }),
    ...overrides
  } as jest.Mocked<ISwapperComponent>
}
