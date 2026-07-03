import { manaBaseToEther, oraclePriceToUsd, usdcBaseToDollars } from '../../logic/treasury/math'
import { HandlerContextWithPath } from '../../types/system'

/**
 * Internal/admin treasury status: live balances (treasury USDC/MANA, CreditsManager MANA),
 * the current oracle price, the ledger summary, and a fresh reconciliation report.
 *
 * This performs chain reads and a DB read, so it is heavier than /status and is intended
 * for ops dashboards, not health checks. It never returns secrets — only the treasury
 * address (public) and aggregate figures.
 */
export async function getTreasuryStatusHandler(
  context: HandlerContextWithPath<
    'chainReader' | 'reconcile' | 'signer' | 'treasuryConfig' | 'logs',
    '/treasury/status'
  >
) {
  const {
    components: { chainReader, reconcile, signer, treasuryConfig, logs }
  } = context
  const logger = logs.getLogger('treasury-status')
  const cfg = treasuryConfig.get()

  try {
    const treasuryAddress = await signer.getAddress()

    const [treasuryUsdc, treasuryMana, creditsManagerMana, oraclePrice, summary, report] = await Promise.all([
      chainReader.getUsdcBalance(treasuryAddress),
      chainReader.getManaBalance(treasuryAddress),
      chainReader.getManaBalance(cfg.addresses.creditsManager),
      chainReader.getOraclePrice(),
      reconcile.getLedgerSummary(),
      reconcile.reconcile()
    ])

    return {
      status: 200,
      body: {
        chainId: cfg.chainId,
        strategy: cfg.refillStrategy,
        swapMode: cfg.swapMode,
        signerMode: cfg.signerMode,
        treasuryAddress,
        balances: {
          treasuryUsdc: usdcBaseToDollars(treasuryUsdc),
          treasuryMana: manaBaseToEther(treasuryMana),
          creditsManagerMana: manaBaseToEther(creditsManagerMana)
        },
        thresholds: {
          targetManaBalance: cfg.targetManaBalance,
          refillThresholdMana: cfg.refillThresholdMana
        },
        oracle: {
          manaUsdPrice: oraclePriceToUsd(oraclePrice),
          raw: oraclePrice.toString()
        },
        ledger: summary,
        reconciliation: report
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to build treasury status', { error: message })
    return {
      status: 503,
      body: { error: 'Treasury status unavailable', message }
    }
  }
}
