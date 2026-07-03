import { BigNumber } from 'ethers'

import { createReconcileComponent } from '../../src/logic/treasury/reconcile'
import { createRefillComponent } from '../../src/logic/treasury/refill'
import { createMockSwapper } from '../../src/logic/treasury/swap/mock-swapper'
import { manaEtherToBase, usdcDollarsToBase } from '../../src/logic/treasury/math'
import { IChainReaderComponent, IDbComponent, LedgerEntryType } from '../../src/types/components'
import {
  createChainReaderMock,
  createLogsMock,
  createMetricsMock,
  createSignerMock,
  createTreasuryConfigMock
} from '../mocks'

/**
 * Integration-style test wiring the REAL swap + refill + reconcile + in-memory ledger
 * together, with only the chain reader and signer mocked. Exercises the full
 * purchase -> refill -> reconcile loop the way components.ts wires it in production,
 * validating that the pieces compose (not just that each unit works in isolation).
 */

const PRICE_02696 = BigNumber.from('26960000') // ~$0.2696/MANA (Amoy mock oracle)
const AMOY_CREDITS_MANAGER = '0x8052a560e6e6ac86eeb7e711a4497f639b322fb3'

/**
 * A tiny in-memory ledger implementing IDbComponent, so reconcile/refill run against a
 * realistic (idempotent, summable) store without Postgres.
 */
function createInMemoryDb(): IDbComponent {
  const rows: Array<{
    id: string
    type: LedgerEntryType
    usdcDelta: string
    manaDelta: string
    reference: string | null
    metadata: Record<string, unknown> | null
    createdAt: number
  }> = []
  let seq = 0

  return {
    insertLedgerEntry: async (entry) => {
      if (entry.reference) {
        const existing = rows.find((r) => r.type === entry.type && r.reference === entry.reference)
        if (existing) {
          return { entry: existing, inserted: false }
        }
      }
      const row = { id: `row-${seq++}`, createdAt: Date.now(), ...entry }
      rows.push(row)
      return { entry: row, inserted: true }
    },
    getLedgerSummary: async () => {
      const sum = (pred: (r: (typeof rows)[number]) => boolean, field: 'usdcDelta' | 'manaDelta') =>
        rows.filter(pred).reduce((acc, r) => acc + BigInt(r[field]), 0n)
      const totalUsdcDeposited = sum((r) => r.type === LedgerEntryType.USDC_DEPOSIT, 'usdcDelta')
      const totalUsdcSpent = -sum((r) => r.type === LedgerEntryType.REFILL, 'usdcDelta')
      const totalManaTransferred = sum((r) => r.type === LedgerEntryType.REFILL, 'manaDelta')
      const totalManaAcquired = rows
        .filter((r) => r.type === LedgerEntryType.REFILL)
        .reduce((acc, r) => acc + BigInt((r.metadata?.manaAcquired as string) ?? '0'), 0n)
      const totalFee = sum((r) => r.type === LedgerEntryType.FEE_RETAINED, 'manaDelta')
      return {
        expectedTreasuryUsdc: (totalUsdcDeposited - totalUsdcSpent).toString(),
        expectedCreditsManagerMana: totalManaTransferred.toString(),
        totalUsdcDeposited: totalUsdcDeposited.toString(),
        totalUsdcSpent: totalUsdcSpent.toString(),
        totalManaAcquired: totalManaAcquired.toString(),
        totalManaTransferred: totalManaTransferred.toString(),
        totalFeeRetainedMana: totalFee.toString(),
        entryCount: rows.length
      }
    },
    getRecentEntries: async (limit) => rows.slice(-limit).reverse()
  }
}

describe('the purchase -> refill -> reconcile loop', () => {
  it('records a deposit, refills the CreditsManager, and reconciles cleanly', async () => {
    const treasuryConfig = createTreasuryConfigMock({
      targetManaBalance: 1000,
      refillThresholdMana: 200,
      minRefillMana: 10,
      oracleSpreadBufferBps: 0, // no buffer so ledger USDC == swapped USDC for an exact reconcile
      slippageBps: 300
    })

    // CreditsManager starts empty (no baseline), so the ledger's "MANA we transferred in"
    // equals the actual on-chain balance and reconciliation is exact. Oracle steady at $0.2696.
    let creditsManagerMana = manaEtherToBase(0)
    const chainReader: jest.Mocked<IChainReaderComponent> = createChainReaderMock({
      getOraclePrice: jest.fn().mockResolvedValue(PRICE_02696),
      getManaBalance: jest.fn(async (addr: string) =>
        addr.toLowerCase() === AMOY_CREDITS_MANAGER ? creditsManagerMana : BigNumber.from(0)
      )
    })

    const logs = createLogsMock()
    const metrics = createMetricsMock()
    const signer = createSignerMock()
    const db = createInMemoryDb()

    const swapper = createMockSwapper({ chainReader, treasuryConfig, logs })
    const reconcile = createReconcileComponent({ db, chainReader, signer, treasuryConfig, logs, metrics })
    const refill = createRefillComponent({ chainReader, swapper, signer, reconcile, treasuryConfig, logs, metrics })

    // 1. A pack purchase deposits $100 USDC into the treasury.
    await reconcile.recordUsdcDeposit({ usdcAmount: usdcDollarsToBase(100), reference: 'pi_pack_100' })

    // A replayed webhook must not double-count.
    const replay = await reconcile.recordUsdcDeposit({ usdcAmount: usdcDollarsToBase(100), reference: 'pi_pack_100' })
    expect(replay.alreadyRecorded).toBe(true)

    // 2. The refill job runs: balance (50) < threshold (200), so it tops up to target.
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(true)
    const acquired = outcome.swap!.manaReceived

    // Simulate the MANA landing in the CreditsManager (the mock swapper doesn't move funds).
    creditsManagerMana = creditsManagerMana.add(acquired)

    // 3. The treasury now holds $100 - spent USDC; the CreditsManager holds the acquired MANA.
    const summary = await reconcile.getLedgerSummary()
    const spent = BigInt(summary.totalUsdcSpent)
    expect(spent).toBeGreaterThan(0n)
    expect(BigInt(summary.expectedTreasuryUsdc)).toBe(usdcDollarsToBase(100).toBigInt() - spent)

    // 4. Reconcile: point the treasury USDC balance at the expected remainder and the
    //    CreditsManager MANA at its real balance — everything should be within tolerance.
    chainReader.getUsdcBalance.mockResolvedValue(BigNumber.from(summary.expectedTreasuryUsdc))
    const report = await reconcile.reconcile()
    expect(report.healthy).toBe(true)
    expect(report.treasuryUsdc.withinTolerance).toBe(true)
    expect(report.creditsManagerMana.withinTolerance).toBe(true)

    // 5. After refill, a second cycle is a no-op (balance now at/above target).
    const second = await refill.runOnce()
    expect(second.executed).toBe(false)
  })

  it('flags drift when the CreditsManager MANA is unexpectedly short', async () => {
    const treasuryConfig = createTreasuryConfigMock({ oracleSpreadBufferBps: 0 })
    let creditsManagerMana = manaEtherToBase(50)
    const chainReader = createChainReaderMock({
      getOraclePrice: jest.fn().mockResolvedValue(PRICE_02696),
      getManaBalance: jest.fn(async (addr: string) =>
        addr.toLowerCase() === AMOY_CREDITS_MANAGER ? creditsManagerMana : BigNumber.from(0)
      )
    })
    const logs = createLogsMock()
    const metrics = createMetricsMock()
    const signer = createSignerMock()
    const db = createInMemoryDb()
    const swapper = createMockSwapper({ chainReader, treasuryConfig, logs })
    const reconcile = createReconcileComponent({ db, chainReader, signer, treasuryConfig, logs, metrics })
    const refill = createRefillComponent({ chainReader, swapper, signer, reconcile, treasuryConfig, logs, metrics })

    await reconcile.recordUsdcDeposit({ usdcAmount: usdcDollarsToBase(500), reference: 'pi_500' })
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(true)

    // The MANA never actually arrived (simulate a lost transfer): CreditsManager stays at 50,
    // but the ledger expects target - 50 more transferred in.
    creditsManagerMana = manaEtherToBase(50)

    const summary = await reconcile.getLedgerSummary()
    chainReader.getUsdcBalance.mockResolvedValue(BigNumber.from(summary.expectedTreasuryUsdc))
    const report = await reconcile.reconcile()

    expect(report.creditsManagerMana.withinTolerance).toBe(false)
    expect(report.healthy).toBe(false)
  })
})
