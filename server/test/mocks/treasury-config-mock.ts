import { AMOY_ADDRESSES } from '../../src/logic/config/chains'
import { RefillStrategy, SignerMode, SwapMode, TreasuryConfig } from '../../src/logic/config/types'
import { ITreasuryConfigComponent } from '../../src/types/components'

const AMOY_CHAIN_ID = 80002

export function createTreasuryConfigMock(overrides: Partial<TreasuryConfig> = {}): ITreasuryConfigComponent {
  const resolved: TreasuryConfig = {
    chainId: AMOY_CHAIN_ID,
    addresses: AMOY_ADDRESSES,
    signerMode: SignerMode.DEV,
    swapMode: SwapMode.MOCK,
    refillStrategy: RefillStrategy.WORKING_BALANCE,
    targetManaBalance: 1000,
    refillThresholdMana: 200,
    minRefillMana: 10,
    slippageBps: 300,
    oracleSpreadBufferBps: 50,
    dexAggregatorUrl: undefined,
    refillMaxPerWindow: 20,
    refillWindowSeconds: 3600,
    ...overrides
  }
  return { get: () => resolved }
}
