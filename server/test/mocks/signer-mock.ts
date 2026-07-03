import { ITreasurySignerComponent } from '../../src/types/components'

const TREASURY_ADDRESS = '0x000000000000000000000000000000000treasury'

export function createSignerMock(
  overrides: Partial<jest.Mocked<ITreasurySignerComponent>> = {}
): jest.Mocked<ITreasurySignerComponent> {
  return {
    getAddress: jest.fn().mockResolvedValue(TREASURY_ADDRESS),
    sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
    ...overrides
  } as jest.Mocked<ITreasurySignerComponent>
}
