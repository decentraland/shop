import { BigNumber } from 'ethers'

import { createReconcileComponent } from '../../../../src/logic/treasury/reconcile/component'
import { LedgerEntryType, IDbComponent, IChainReaderComponent, ITreasurySignerComponent, IReconcileComponent, LedgerSummary } from '../../../../src/types/components'
import {
  createChainReaderMock,
  createDbMock,
  createLogsMock,
  createMetricsMock,
  createSignerMock,
  createTreasuryConfigMock
} from '../../../mocks'

let db: jest.Mocked<IDbComponent>
let chainReader: jest.Mocked<IChainReaderComponent>
let signer: jest.Mocked<ITreasurySignerComponent>
let reconcile: IReconcileComponent

function build() {
  return createReconcileComponent({
    db,
    chainReader,
    signer,
    treasuryConfig: createTreasuryConfigMock(),
    logs: createLogsMock(),
    metrics: createMetricsMock()
  })
}

const summaryWith = (over: Partial<LedgerSummary>): LedgerSummary => ({
  expectedTreasuryUsdc: '0',
  expectedCreditsManagerMana: '0',
  totalUsdcDeposited: '0',
  totalUsdcSpent: '0',
  totalManaAcquired: '0',
  totalManaTransferred: '0',
  totalFeeRetainedMana: '0',
  entryCount: 0,
  ...over
})

beforeEach(() => {
  db = createDbMock()
  chainReader = createChainReaderMock()
  signer = createSignerMock()
})

describe('when recording a USDC deposit', () => {
  beforeEach(() => {
    reconcile = build()
  })

  it('should insert a positive USDC delta with zero MANA', async () => {
    await reconcile.recordUsdcDeposit({ usdcAmount: BigNumber.from('5000000'), reference: 'pi_123' })
    expect(db.insertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LedgerEntryType.USDC_DEPOSIT,
        usdcDelta: '5000000',
        manaDelta: '0',
        reference: 'pi_123'
      })
    )
  })

  it('should reject a non-positive amount', async () => {
    await expect(reconcile.recordUsdcDeposit({ usdcAmount: BigNumber.from(0), reference: 'x' })).rejects.toThrow()
  })

  describe('and the deposit was already recorded', () => {
    beforeEach(() => {
      db.insertLedgerEntry.mockResolvedValue({
        entry: {
          id: 'existing',
          type: LedgerEntryType.USDC_DEPOSIT,
          usdcDelta: '5000000',
          manaDelta: '0',
          reference: 'pi_123',
          metadata: null,
          createdAt: Date.now()
        },
        inserted: false
      })
      reconcile = build()
    })

    it('should report it as already recorded (idempotent)', async () => {
      const result = await reconcile.recordUsdcDeposit({ usdcAmount: BigNumber.from('5000000'), reference: 'pi_123' })
      expect(result.alreadyRecorded).toBe(true)
    })
  })
})

describe('when recording a refill', () => {
  beforeEach(() => {
    reconcile = build()
  })

  it('should record USDC spent as a negative delta and MANA transferred as positive', async () => {
    await reconcile.recordRefill({
      usdcSpent: BigNumber.from('800000000'),
      manaAcquired: BigNumber.from('900000000000000000000'),
      manaTransferred: BigNumber.from('900000000000000000000'),
      swapTxHash: '0xswap',
      transferTxHash: '0xtransfer',
      oraclePrice: BigNumber.from('100000000')
    })
    expect(db.insertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LedgerEntryType.REFILL,
        usdcDelta: '-800000000',
        manaDelta: '900000000000000000000',
        reference: '0xtransfer'
      })
    )
  })
})

describe('when reconciling balances', () => {
  describe('and actual balances match expectations', () => {
    beforeEach(() => {
      db.getLedgerSummary.mockResolvedValue(
        summaryWith({ expectedTreasuryUsdc: '10000000', expectedCreditsManagerMana: '1000000000000000000000' })
      )
      chainReader.getUsdcBalance.mockResolvedValue(BigNumber.from('10000000'))
      chainReader.getManaBalance.mockResolvedValue(BigNumber.from('1000000000000000000000'))
      reconcile = build()
    })

    it('should report healthy with zero drift', async () => {
      const report = await reconcile.reconcile()
      expect(report.healthy).toBe(true)
      expect(report.treasuryUsdc.driftBps).toBe(0)
      expect(report.creditsManagerMana.driftBps).toBe(0)
    })
  })

  describe('and the treasury USDC drifts beyond tolerance', () => {
    beforeEach(() => {
      db.getLedgerSummary.mockResolvedValue(
        summaryWith({ expectedTreasuryUsdc: '10000000', expectedCreditsManagerMana: '1000000000000000000000' })
      )
      // 5% short => beyond the 2% default tolerance
      chainReader.getUsdcBalance.mockResolvedValue(BigNumber.from('9500000'))
      chainReader.getManaBalance.mockResolvedValue(BigNumber.from('1000000000000000000000'))
      reconcile = build()
    })

    it('should flag the treasury USDC as out of tolerance and report unhealthy', async () => {
      const report = await reconcile.reconcile()
      expect(report.treasuryUsdc.withinTolerance).toBe(false)
      expect(report.treasuryUsdc.driftBps).toBe(500)
      expect(report.creditsManagerMana.withinTolerance).toBe(true)
      expect(report.healthy).toBe(false)
    })
  })

  describe('and the CreditsManager MANA drifts within tolerance', () => {
    beforeEach(() => {
      db.getLedgerSummary.mockResolvedValue(
        summaryWith({ expectedTreasuryUsdc: '10000000', expectedCreditsManagerMana: '1000000000000000000000' })
      )
      chainReader.getUsdcBalance.mockResolvedValue(BigNumber.from('10000000'))
      // 1% consumed since last refill => within 2% tolerance
      chainReader.getManaBalance.mockResolvedValue(BigNumber.from('990000000000000000000'))
      reconcile = build()
    })

    it('should stay healthy', async () => {
      const report = await reconcile.reconcile()
      expect(report.creditsManagerMana.driftBps).toBe(100)
      expect(report.healthy).toBe(true)
    })
  })
})
