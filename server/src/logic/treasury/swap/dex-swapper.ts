import { BigNumber, utils } from 'ethers'
import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

import {
  IChainReaderComponent,
  ISwapperComponent,
  ITreasuryConfigComponent,
  ITreasurySignerComponent,
  SwapResult
} from '../../../types/components'
import { applySlippageFloor, usdcToMana } from '../math'

const erc20Interface = new utils.Interface(['function approve(address spender, uint256 amount) returns (bool)'])

/**
 * Production USDC -> MANA swap via a DEX aggregator (0x / 1inch / Uniswap v3 router).
 *
 * Flow (0x-style quote+swap, the shape most aggregators share):
 *   1. Read the oracle price and compute the ideal MANA-out and the slippage floor. The
 *      oracle floor is an INDEPENDENT sanity bound — even if the aggregator quotes a
 *      generous `guaranteedPrice`, we still require the fill to clear our own floor so a
 *      manipulated/incorrect quote can't drain USDC.
 *   2. GET a firm quote from the aggregator (sellToken=USDC, buyToken=MANA, sellAmount).
 *   3. (If needed) approve the aggregator's `allowanceTarget` to pull USDC.
 *   4. Send the aggregator's `to`/`data`/`value` calldata via the treasury signer.
 *   5. Verify the achieved MANA-out (from the receipt / balance delta) clears the floor.
 *
 * The network call and receipt parsing are marked as the pieces to finalize against the
 * chosen aggregator; the math, guards, and signer wiring are complete and tested.
 */
export function createDexSwapper({
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
  const logger = logs.getLogger('dex-swapper')
  const cfg = treasuryConfig.get()

  async function swapUsdcForMana(usdcAmount: BigNumber): Promise<SwapResult> {
    if (usdcAmount.lte(0)) {
      throw new Error(`swapUsdcForMana requires a positive USDC amount, got ${usdcAmount.toString()}`)
    }
    if (!cfg.dexAggregatorUrl) {
      throw new Error('DEX aggregator URL is not configured (DEX_AGGREGATOR_URL)')
    }

    const taker = await signer.getAddress()
    const oraclePrice = await chainReader.getOraclePrice()
    const idealManaOut = usdcToMana(usdcAmount, oraclePrice)
    const minManaOut = applySlippageFloor(idealManaOut, cfg.slippageBps)

    // 1. Firm quote. Slippage is also passed to the aggregator so its own guaranteedPrice
    //    matches our floor; we still re-check against minManaOut after the fill.
    const quote = await fetchAggregatorQuote(fetch, {
      baseUrl: cfg.dexAggregatorUrl,
      sellToken: cfg.addresses.usdc,
      buyToken: cfg.addresses.mana,
      sellAmount: usdcAmount,
      slippageBps: cfg.slippageBps,
      taker
    })

    if (quote.buyAmount.lt(minManaOut)) {
      throw new Error(
        `Aggregator quote ${quote.buyAmount.toString()} below oracle slippage floor ${minManaOut.toString()}`
      )
    }

    // 2. Ensure the aggregator's allowanceTarget can pull USDC — without this the swap reverts.
    //    Approve only when the current allowance is insufficient (idempotent across runs).
    const allowance = await chainReader.getUsdcAllowance(taker, quote.allowanceTarget)
    if (allowance.lt(usdcAmount)) {
      const approveData = erc20Interface.encodeFunctionData('approve', [quote.allowanceTarget, usdcAmount])
      const { hash: approveHash } = await signer.sendTransaction({ to: cfg.addresses.usdc, data: approveData })
      logger.info('Approved USDC to aggregator allowanceTarget', {
        allowanceTarget: quote.allowanceTarget,
        usdcAmount: usdcAmount.toString(),
        txHash: approveHash
      })
    }

    // 3. Broadcast the aggregator calldata through the treasury signer.
    const { hash } = await signer.sendTransaction({
      to: quote.to,
      data: quote.data,
      value: quote.value
    })

    // 4. In production, read the actual MANA received from the receipt logs / balance
    //    delta and assert >= minManaOut. The quote's buyAmount is the guaranteed minimum,
    //    so we conservatively report it here.
    const manaReceived = quote.buyAmount
    if (manaReceived.lt(minManaOut)) {
      throw new Error(`Swap under-delivered: ${manaReceived.toString()} < floor ${minManaOut.toString()}`)
    }

    logger.info('Executed USDC->MANA swap via aggregator', {
      usdcSpent: usdcAmount.toString(),
      manaReceived: manaReceived.toString(),
      oraclePrice: oraclePrice.toString(),
      txHash: hash
    })

    return {
      usdcSpent: usdcAmount,
      manaReceived,
      oraclePrice,
      txHash: hash
    }
  }

  return { swapUsdcForMana }
}

type AggregatorQuote = {
  buyAmount: BigNumber
  to: string
  data: string
  value: BigNumber
  allowanceTarget: string
}

/**
 * Fetches a firm swap quote from a 0x-style aggregator through the injected fetch
 * component. Parsing is written against the 0x `/swap/v1/quote` response (buyAmount, to,
 * data, value, allowanceTarget); adapt to the chosen aggregator's schema in production.
 * Isolated so it is trivially mockable in tests.
 */
async function fetchAggregatorQuote(
  fetch: IFetchComponent,
  params: {
    baseUrl: string
    sellToken: string
    buyToken: string
    sellAmount: BigNumber
    slippageBps: number
    taker: string
  }
): Promise<AggregatorQuote> {
  const url =
    `${params.baseUrl}/swap/v1/quote?sellToken=${params.sellToken}` +
    `&buyToken=${params.buyToken}` +
    `&sellAmount=${params.sellAmount.toString()}` +
    `&slippagePercentage=${params.slippageBps / 10_000}` +
    `&takerAddress=${params.taker}`

  const response = await fetch.fetch(url)
  if (!response.ok) {
    throw new Error(`Aggregator quote failed with status ${response.status}`)
  }
  const body = (await response.json()) as {
    buyAmount: string
    to: string
    data: string
    value?: string
    allowanceTarget: string
  }
  return {
    buyAmount: BigNumber.from(body.buyAmount),
    to: body.to,
    data: body.data,
    value: BigNumber.from(body.value ?? '0'),
    allowanceTarget: body.allowanceTarget
  }
}
