import { BigNumber, Contract, providers } from 'ethers'

import { IChainReaderComponent, ITreasuryConfigComponent } from '../../types/components'
import { ILoggerComponent } from '@well-known-components/interfaces'

import { CHAINLINK_AGGREGATOR_ABI, ERC20_ABI } from './abis'

/**
 * Reads on-chain state the treasury depends on: MANA/USDC balances and the MANA/USD
 * oracle price. Wraps ethers Contract instances behind {@link IChainReaderComponent} so
 * downstream logic stays provider-agnostic and unit-testable.
 *
 * The oracle price is validated: a non-positive answer or a stale round (updatedAt = 0)
 * is rejected rather than propagated into swap math, where it would corrupt every quote.
 */
export function createChainReaderComponent({
  provider,
  treasuryConfig,
  logs
}: {
  provider: providers.Provider
  treasuryConfig: ITreasuryConfigComponent
  logs: ILoggerComponent
}): IChainReaderComponent {
  const logger = logs.getLogger('chain-reader')
  const cfg = treasuryConfig.get()

  const mana = new Contract(cfg.addresses.mana, ERC20_ABI, provider)
  const usdc = new Contract(cfg.addresses.usdc, ERC20_ABI, provider)
  const oracle = new Contract(cfg.addresses.manaUsdOracle, CHAINLINK_AGGREGATOR_ABI, provider)

  async function getManaBalance(address: string): Promise<BigNumber> {
    return mana.balanceOf(address)
  }

  async function getUsdcBalance(address: string): Promise<BigNumber> {
    return usdc.balanceOf(address)
  }

  async function getOraclePrice(): Promise<BigNumber> {
    const round = await oracle.latestRoundData()
    const answer: BigNumber = round.answer
    const updatedAt: BigNumber = round.updatedAt

    if (answer.lte(0)) {
      logger.error('Oracle returned a non-positive price', { answer: answer.toString() })
      throw new Error(`Oracle returned a non-positive MANA/USD price: ${answer.toString()}`)
    }
    if (updatedAt.isZero()) {
      logger.error('Oracle round is incomplete (updatedAt=0)')
      throw new Error('Oracle round is incomplete (updatedAt=0)')
    }
    return answer
  }

  return {
    getManaBalance,
    getUsdcBalance,
    getOraclePrice
  }
}
