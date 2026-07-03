import { BigNumber, constants } from 'ethers'

import { IChainReaderComponent } from '../../src/types/components'

export function createChainReaderMock(
  overrides: Partial<jest.Mocked<IChainReaderComponent>> = {}
): jest.Mocked<IChainReaderComponent> {
  return {
    getManaBalance: jest.fn().mockResolvedValue(BigNumber.from(0)),
    getUsdcBalance: jest.fn().mockResolvedValue(BigNumber.from(0)),
    // Default to a max allowance so swap tests don't trigger an approve unless they opt in.
    getUsdcAllowance: jest.fn().mockResolvedValue(constants.MaxUint256),
    getOraclePrice: jest.fn().mockResolvedValue(BigNumber.from(0)),
    ...overrides
  } as jest.Mocked<IChainReaderComponent>
}
