import { IDbComponent, LedgerSummary } from '../../src/types/components'

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

export function createDbMock(overrides: Partial<jest.Mocked<IDbComponent>> = {}): jest.Mocked<IDbComponent> {
  return {
    insertLedgerEntry: jest.fn().mockImplementation(async (entry) => ({
      entry: {
        id: 'entry-id',
        type: entry.type,
        usdcDelta: entry.usdcDelta,
        manaDelta: entry.manaDelta,
        reference: entry.reference,
        metadata: entry.metadata,
        createdAt: Date.now()
      },
      inserted: true
    })),
    getLedgerSummary: jest.fn().mockResolvedValue(emptySummary),
    getRecentEntries: jest.fn().mockResolvedValue([]),
    getRefillCountSince: jest.fn().mockResolvedValue(0),
    // By default the lock is acquired and the body runs, so refill tests exercise the refill flow.
    tryRunWithRefillLock: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => ({
      acquired: true,
      result: await fn()
    })),
    ...overrides
  } as jest.Mocked<IDbComponent>
}
