import { BigNumber } from 'ethers'
import { ILoggerComponent } from '@well-known-components/interfaces'

import { IChainReaderComponent, ISwapperComponent, ITreasuryConfigComponent, SwapResult } from '../../../types/components'
import { applySlippageFloor, usdcToMana } from '../math'

/**
 * Amoy testnet swap mock. Amoy has no real USDC/MANA DEX liquidity, so a real swap is
 * impossible there; this simulates the fill at the live mock-oracle rate.
 *
 * To stay faithful to production behaviour it still exercises the full guard path:
 *   1. quote MANA out from USDC in at the oracle price
 *   2. apply a small simulated adverse fill (so `manaReceived` sits between the slippage
 *      floor and the ideal quote, like a real DEX)
 *   3. assert the simulated fill is >= the slippage floor, else throw
 *
 * It does NOT move funds on-chain (txHash is null) — the refill component performs the
 * real MANA transfer to the CreditsManager separately, which DOES work on Amoy.
 */
export function createMockSwapper({
  chainReader,
  treasuryConfig,
  logs,
  simulatedSlippageBps = 0
}: {
  chainReader: IChainReaderComponent
  treasuryConfig: ITreasuryConfigComponent
  logs: ILoggerComponent
  /**
   * Optional adverse fill applied to the ideal oracle quote, in bps, to emulate real DEX
   * behaviour in tests. Defaults to 0 (fill exactly at oracle) so the happy path is exact.
   */
  simulatedSlippageBps?: number
}): ISwapperComponent {
  const logger = logs.getLogger('mock-swapper')
  const cfg = treasuryConfig.get()

  async function swapUsdcForMana(usdcAmount: BigNumber): Promise<SwapResult> {
    if (usdcAmount.lte(0)) {
      throw new Error(`swapUsdcForMana requires a positive USDC amount, got ${usdcAmount.toString()}`)
    }

    const oraclePrice = await chainReader.getOraclePrice()
    const idealManaOut = usdcToMana(usdcAmount, oraclePrice)

    // Minimum the swap must deliver given the configured tolerance.
    const minManaOut = applySlippageFloor(idealManaOut, cfg.slippageBps)

    // Simulated actual fill (ideal reduced by the simulated adverse move).
    const manaReceived = applySlippageFloor(idealManaOut, simulatedSlippageBps)

    if (manaReceived.lt(minManaOut)) {
      throw new Error(
        `Mock swap fill ${manaReceived.toString()} below slippage floor ${minManaOut.toString()} ` +
          `(simulatedSlippageBps=${simulatedSlippageBps}, slippageBps=${cfg.slippageBps})`
      )
    }

    logger.info('Simulated USDC->MANA swap (Amoy mock)', {
      usdcSpent: usdcAmount.toString(),
      manaReceived: manaReceived.toString(),
      oraclePrice: oraclePrice.toString()
    })

    return {
      usdcSpent: usdcAmount,
      manaReceived,
      oraclePrice,
      txHash: null
    }
  }

  return { swapUsdcForMana }
}
