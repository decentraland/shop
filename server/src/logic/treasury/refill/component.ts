import { BigNumber, utils } from 'ethers'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'

import {
  IChainReaderComponent,
  IReconcileComponent,
  IRefillComponent,
  ISwapperComponent,
  ITreasuryConfigComponent,
  ITreasurySignerComponent,
  RefillOutcome,
  RefillPlan
} from '../../../types/components'
import { ERC20_ABI } from '../../../adapters/chain/abis'
import { metricDeclarations } from '../../../metrics'
import { applyBufferBps, manaBaseToEther, usdcBaseToDollars } from '../math'

import { computeRefillPlan } from './plan'

const erc20Interface = new utils.Interface(ERC20_ABI)

/**
 * Keeps the CreditsManager's MANA balance funded.
 *
 * A cycle ({@link runOnce}) does:
 *   1. read the CreditsManager MANA balance + oracle price
 *   2. {@link computeRefillPlan} to decide whether/how much to refill (pure, tested)
 *   3. if refilling: over-buy USDC by the oracle-spread buffer, swap USDC->MANA, then
 *      transfer the received MANA to the CreditsManager
 *   4. record the whole refill in the ledger for reconciliation
 *
 * Design choices:
 *   - The buffer is applied to the USDC-to-spend (not the MANA target) so the fill covers
 *     the oracle/DEX spread and the CreditsManager ends up at/above target.
 *   - Every leg is best-effort logged; a failure after the swap but before the transfer is
 *     surfaced in the outcome and metrics so ops can reconcile (no silent MANA stranding).
 *   - The component is idempotent-friendly at the caller level: the timer runs it on an
 *     interval, and a cycle that finds the balance healthy is a cheap no-op.
 */
export function createRefillComponent({
  chainReader,
  swapper,
  signer,
  reconcile,
  treasuryConfig,
  logs,
  metrics
}: {
  chainReader: IChainReaderComponent
  swapper: ISwapperComponent
  signer: ITreasurySignerComponent
  reconcile: IReconcileComponent
  treasuryConfig: ITreasuryConfigComponent
  logs: ILoggerComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
}): IRefillComponent {
  const logger = logs.getLogger('refill')
  const cfg = treasuryConfig.get()

  async function planRefill(): Promise<RefillPlan> {
    const [currentManaBalance, oraclePrice] = await Promise.all([
      chainReader.getManaBalance(cfg.addresses.creditsManager),
      chainReader.getOraclePrice()
    ])

    metrics.observe('treasury_credits_manager_mana_balance', {}, manaBaseToEther(currentManaBalance))

    return computeRefillPlan({
      strategy: cfg.refillStrategy,
      currentManaBalance,
      oraclePrice,
      targetManaEther: cfg.targetManaBalance,
      thresholdManaEther: cfg.refillThresholdMana,
      minRefillManaEther: cfg.minRefillMana
    })
  }

  async function runOnce(): Promise<RefillOutcome> {
    const plan = await planRefill()

    if (!plan.shouldRefill) {
      logger.debug('No refill needed', { reason: plan.reason })
      return { plan, executed: false }
    }

    logger.info('Refill needed', {
      reason: plan.reason,
      currentManaBalance: manaBaseToEther(plan.currentManaBalance),
      manaToAcquire: manaBaseToEther(plan.manaToAcquire),
      usdcToSpend: usdcBaseToDollars(plan.usdcToSpend)
    })

    try {
      // Over-buy USDC by the oracle-spread buffer so the fill still reaches target after
      // the spread between the oracle price and the DEX fill.
      const usdcToSpend = applyBufferBps(plan.usdcToSpend, cfg.oracleSpreadBufferBps)

      const swap = await swapper.swapUsdcForMana(usdcToSpend)

      // Transfer the acquired MANA into the CreditsManager.
      const transferData = erc20Interface.encodeFunctionData('transfer', [
        cfg.addresses.creditsManager,
        swap.manaReceived
      ])
      const { hash: transferTxHash } = await signer.sendTransaction({
        to: cfg.addresses.mana,
        data: transferData
      })

      const entry = await reconcile.recordRefill({
        usdcSpent: swap.usdcSpent,
        manaAcquired: swap.manaReceived,
        manaTransferred: swap.manaReceived,
        swapTxHash: swap.txHash,
        transferTxHash,
        oraclePrice: swap.oraclePrice
      })

      metrics.increment('treasury_refills_total', { strategy: cfg.refillStrategy })
      metrics.increment('treasury_mana_acquired_total', {}, manaBaseToEther(swap.manaReceived))
      metrics.increment('treasury_usdc_spent_total', {}, usdcBaseToDollars(swap.usdcSpent))

      logger.info('Refill executed', {
        manaReceived: manaBaseToEther(swap.manaReceived),
        usdcSpent: usdcBaseToDollars(swap.usdcSpent),
        swapTxHash: swap.txHash ?? 'n/a',
        transferTxHash,
        ledgerEntryId: entry.id
      })

      return {
        plan,
        executed: true,
        swap,
        transferTxHash,
        ledgerEntryId: entry.id
      }
    } catch (error) {
      // Failure is surfaced via the metric + the returned outcome (not silent). If the swap already
      // succeeded and only the transfer failed, the acquired MANA sits in the treasury wallet for ops
      // to move. TODO (before SWAP_MODE=dex on mainnet): on a post-swap failure write a partial ledger
      // entry (manaTransferred: 0) so reconciliation books the acquired MANA automatically.
      const message = error instanceof Error ? error.message : String(error)
      metrics.increment('treasury_refill_failures_total', {})
      logger.error('Refill failed', { error: message, reason: plan.reason })
      return { plan, executed: false, error: message }
    }
  }

  return {
    planRefill,
    runOnce
  }
}
