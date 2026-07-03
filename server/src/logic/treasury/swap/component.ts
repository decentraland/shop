import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

import {
  IChainReaderComponent,
  ISwapperComponent,
  ITreasuryConfigComponent,
  ITreasurySignerComponent
} from '../../../types/components'
import { SwapMode } from '../../config/types'

import { createDexSwapper } from './dex-swapper'
import { createMockSwapper } from './mock-swapper'

/**
 * Selects the swap backend by `treasuryConfig.swapMode`:
 *   - SwapMode.MOCK  -> {@link createMockSwapper} (Amoy; no DEX liquidity, fills at oracle)
 *   - SwapMode.DEX   -> {@link createDexSwapper} (production; real aggregator + guards)
 *
 * Both satisfy {@link ISwapperComponent}, so refill logic is identical across environments.
 */
export function createSwapperComponent({
  chainReader,
  treasuryConfig,
  signer,
  fetch,
  logs
}: {
  chainReader: IChainReaderComponent
  treasuryConfig: ITreasuryConfigComponent
  signer: ITreasurySignerComponent
  fetch: IFetchComponent
  logs: ILoggerComponent
}): ISwapperComponent {
  const { swapMode } = treasuryConfig.get()

  if (swapMode === SwapMode.DEX) {
    return createDexSwapper({ chainReader, treasuryConfig, signer, fetch, logs })
  }

  return createMockSwapper({ chainReader, treasuryConfig, logs })
}
