import { IReconcileComponent, LedgerEntryType, LedgerSummary } from '../../src/types/components'

const emptySummary: LedgerSummary = {
  expectedTreasuryUsdc: '0',
  expectedCreditsManagerMana: '0',
  totalUsdcDeposited: '0',
  totalUsdcSpent: '0',
  totalManaAcquired: '0',
  totalManaTransferred: '0',
  totalFeeRetainedMana: '0',
  entryCount: 0
}

export function createReconcileMock(
  overrides: Partial<jest.Mocked<IReconcileComponent>> = {}
): jest.Mocked<IReconcileComponent> {
  return {
    recordUsdcDeposit: jest.fn().mockResolvedValue({
      entry: {
        id: 'deposit-id',
        type: LedgerEntryType.USDC_DEPOSIT,
        usdcDelta: '0',
        manaDelta: '0',
        reference: null,
        metadata: null,
        createdAt: Date.now()
      },
      alreadyRecorded: false
    }),
    recordRefill: jest.fn().mockResolvedValue({
      id: 'refill-id',
      type: LedgerEntryType.REFILL,
      usdcDelta: '0',
      manaDelta: '0',
      reference: null,
      metadata: null,
      createdAt: Date.now()
    }),
    reconcile: jest.fn(),
    getLedgerSummary: jest.fn().mockResolvedValue(emptySummary),
    ...overrides
  } as jest.Mocked<IReconcileComponent>
}
