import { BigNumber } from 'ethers'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'

import {
  IChainReaderComponent,
  IDbComponent,
  IReconcileComponent,
  ITreasuryConfigComponent,
  ITreasurySignerComponent,
  LedgerEntry,
  LedgerEntryType,
  LedgerSummary,
  ReconciliationReport,
  RecordDepositInput,
  RecordRefillInput
} from '../../../types/components'
import { metricDeclarations } from '../../../metrics'

import { computeDrift } from './drift'

/**
 * Reconciliation / ledger.
 *
 * Records every treasury flow as a double-sided (usdcDelta, manaDelta) entry and derives
 * expected balances by summing the ledger. `reconcile()` compares those expectations to
 * actual on-chain / treasury balances and flags drift beyond a configurable tolerance.
 *
 * Sign convention (from the treasury's point of view):
 *   - USDC deposit:   +usdc, 0 mana           (dollars arrive to back credits)
 *   - refill:         -usdc, +mana(transferred to CreditsManager, tracked separately)
 *   - fee retained:   0 usdc, +mana           (fee kept in MANA; VISION.md §5)
 *
 * `expectedTreasuryUsdc` = deposited - spent. `expectedCreditsManagerMana` = MANA we pushed
 * into the CreditsManager via refills. Consumption of that MANA by settlements is an
 * expected outflow the report accounts for via tolerance (settlement bookkeeping lives in
 * the credits-server; here we bound drift rather than track every sale).
 */
export function createReconcileComponent({
  db,
  chainReader,
  signer,
  treasuryConfig,
  logs,
  metrics
}: {
  db: IDbComponent
  chainReader: IChainReaderComponent
  signer: ITreasurySignerComponent
  treasuryConfig: ITreasuryConfigComponent
  logs: ILoggerComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
}): IReconcileComponent {
  const logger = logs.getLogger('reconcile')
  const cfg = treasuryConfig.get()
  const toleranceBps = 200 // 2% default drift tolerance; covered by fee margin/buffer.

  async function recordUsdcDeposit(
    input: RecordDepositInput
  ): Promise<{ entry: LedgerEntry; alreadyRecorded: boolean }> {
    if (input.usdcAmount.lte(0)) {
      throw new Error(`recordUsdcDeposit requires a positive amount, got ${input.usdcAmount.toString()}`)
    }
    const { entry, inserted } = await db.insertLedgerEntry({
      type: LedgerEntryType.USDC_DEPOSIT,
      usdcDelta: input.usdcAmount.toString(),
      manaDelta: '0',
      reference: input.reference,
      metadata: input.metadata ?? null
    })
    if (!inserted) {
      logger.warn('Duplicate USDC deposit ignored (idempotent)', { reference: input.reference })
    } else {
      logger.info('Recorded USDC deposit', { reference: input.reference, usdc: input.usdcAmount.toString() })
    }
    return { entry, alreadyRecorded: !inserted }
  }

  async function recordRefill(input: RecordRefillInput): Promise<LedgerEntry> {
    const { entry } = await db.insertLedgerEntry({
      type: LedgerEntryType.REFILL,
      // USDC leaves the treasury (negative); MANA acquired is captured in metadata, and the
      // MANA that reaches the CreditsManager is the positive manaDelta.
      usdcDelta: input.usdcSpent.mul(-1).toString(),
      manaDelta: input.manaTransferred.toString(),
      reference: input.transferTxHash ?? input.swapTxHash,
      metadata: {
        manaAcquired: input.manaAcquired.toString(),
        swapTxHash: input.swapTxHash,
        transferTxHash: input.transferTxHash,
        oraclePrice: input.oraclePrice.toString()
      }
    })
    return entry
  }

  async function getLedgerSummary(): Promise<LedgerSummary> {
    return db.getLedgerSummary()
  }

  async function reconcile(): Promise<ReconciliationReport> {
    const [summary, treasuryAddress] = await Promise.all([db.getLedgerSummary(), signer.getAddress()])

    const [actualTreasuryUsdc, actualCreditsManagerMana] = await Promise.all([
      chainReader.getUsdcBalance(treasuryAddress),
      chainReader.getManaBalance(cfg.addresses.creditsManager)
    ])

    const expectedTreasuryUsdc = BigNumber.from(summary.expectedTreasuryUsdc)
    const expectedCreditsManagerMana = BigNumber.from(summary.expectedCreditsManagerMana)

    const usdcDrift = computeDrift(expectedTreasuryUsdc, actualTreasuryUsdc, toleranceBps)
    const manaDrift = computeDrift(expectedCreditsManagerMana, actualCreditsManagerMana, toleranceBps)

    const healthy = usdcDrift.withinTolerance && manaDrift.withinTolerance

    metrics.observe('treasury_reconciliation_drift_bps', { account: 'treasury_usdc' }, usdcDrift.driftBps)
    metrics.observe('treasury_reconciliation_drift_bps', { account: 'credits_manager_mana' }, manaDrift.driftBps)
    metrics.observe('treasury_reconciliation_healthy', {}, healthy ? 1 : 0)

    if (!healthy) {
      logger.warn('Reconciliation drift detected', {
        usdcDriftBps: usdcDrift.driftBps,
        manaDriftBps: manaDrift.driftBps,
        expectedTreasuryUsdc: expectedTreasuryUsdc.toString(),
        actualTreasuryUsdc: actualTreasuryUsdc.toString(),
        expectedCreditsManagerMana: expectedCreditsManagerMana.toString(),
        actualCreditsManagerMana: actualCreditsManagerMana.toString()
      })
    }

    return {
      timestamp: Date.now(),
      treasuryUsdc: {
        expected: expectedTreasuryUsdc.toString(),
        actual: actualTreasuryUsdc.toString(),
        driftBps: usdcDrift.driftBps,
        withinTolerance: usdcDrift.withinTolerance
      },
      creditsManagerMana: {
        expected: expectedCreditsManagerMana.toString(),
        actual: actualCreditsManagerMana.toString(),
        driftBps: manaDrift.driftBps,
        withinTolerance: manaDrift.withinTolerance
      },
      healthy
    }
  }

  return {
    recordUsdcDeposit,
    recordRefill,
    reconcile,
    getLedgerSummary
  }
}
