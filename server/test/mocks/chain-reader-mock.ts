import { BigNumber } from 'ethers'

import { IChainReaderComponent } from '../../src/types/components'

export function createChainReaderMock(
  overrides: Partial<jest.Mocked<IChainReaderComponent>> = {}
): jest.Mocked<IChainReaderComponent> {
  return {
    getManaBalance: jest.fn().mockResolvedValue(BigNumber.from(0)),
    getUsdcBalance: jest.fn().mockResolvedValue(BigNumber.from(0)),
    getOraclePrice: jest.fn().mockResolvedValue(BigNumber.from(0)),
    ...overrides
  } as jest.Mocked<IChainReaderComponent>
}
