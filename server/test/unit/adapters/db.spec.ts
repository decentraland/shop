import { createDbAdapter } from '../../../src/adapters/db'
import { IDbComponent, LedgerEntryType } from '../../../src/types/components'
import { createPgMock } from '../../mocks/pg-mock'

let pg: ReturnType<typeof createPgMock>
let db: IDbComponent

beforeEach(async () => {
  pg = createPgMock()
  db = await createDbAdapter({ pg })
})

describe('when inserting a ledger entry', () => {
  describe('and the row is new', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'row-1',
            type: LedgerEntryType.USDC_DEPOSIT,
            usdc_delta: '5000000',
            mana_delta: '0',
            reference: 'pi_1',
            metadata: null,
            created_at: '1700000000000'
          }
        ],
        rowCount: 1
      } as any)
    })

    it('should report it as inserted and map the row', async () => {
      const result = await db.insertLedgerEntry({
        type: LedgerEntryType.USDC_DEPOSIT,
        usdcDelta: '5000000',
        manaDelta: '0',
        reference: 'pi_1',
        metadata: null
      })
      expect(result.inserted).toBe(true)
      expect(result.entry.usdcDelta).toBe('5000000')
      expect(result.entry.createdAt).toBe(1700000000000)
    })
  })

  describe('and the row conflicts on (type, reference)', () => {
    beforeEach(() => {
      // First query (INSERT ... ON CONFLICT DO NOTHING RETURNING) returns no rows.
      pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
      // Second query (SELECT existing) returns the pre-existing row.
      pg.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'existing',
            type: LedgerEntryType.USDC_DEPOSIT,
            usdc_delta: '5000000',
            mana_delta: '0',
            reference: 'pi_1',
            metadata: null,
            created_at: '1699999999999'
          }
        ],
        rowCount: 1
      } as any)
    })

    it('should return the existing row with inserted=false', async () => {
      const result = await db.insertLedgerEntry({
        type: LedgerEntryType.USDC_DEPOSIT,
        usdcDelta: '5000000',
        manaDelta: '0',
        reference: 'pi_1',
        metadata: null
      })
      expect(result.inserted).toBe(false)
      expect(result.entry.id).toBe('existing')
      expect(pg.query).toHaveBeenCalledTimes(2)
    })
  })
})

describe('when building the ledger summary', () => {
  beforeEach(() => {
    pg.query.mockResolvedValueOnce({
      rows: [
        {
          total_usdc_deposited: '10000000',
          total_usdc_spent: '3000000',
          total_mana_acquired: '900000000000000000000',
          total_mana_transferred: '900000000000000000000',
          total_fee_retained_mana: '0',
          entry_count: '5'
        }
      ],
      rowCount: 1
    } as any)
  })

  it('should derive expected treasury USDC as deposited minus spent', async () => {
    const summary = await db.getLedgerSummary()
    expect(summary.expectedTreasuryUsdc).toBe('7000000') // 10 - 3
    expect(summary.expectedCreditsManagerMana).toBe('900000000000000000000')
    expect(summary.entryCount).toBe(5)
  })
})

describe('when fetching recent entries', () => {
  beforeEach(() => {
    pg.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          type: LedgerEntryType.REFILL,
          usdc_delta: '-1000000',
          mana_delta: '3700000000000000000',
          reference: '0xtx',
          metadata: { swapTxHash: '0xswap' },
          created_at: '1700000000001'
        }
      ],
      rowCount: 1
    } as any)
  })

  it('should map rows to ledger entries', async () => {
    const entries = await db.getRecentEntries(10)
    expect(entries).toHaveLength(1)
    expect(entries[0].manaDelta).toBe('3700000000000000000')
    expect(entries[0].metadata).toEqual({ swapTxHash: '0xswap' })
  })
})

describe('when counting refills since a timestamp', () => {
  it('should return the parsed count from the query', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 } as any)
    const count = await db.getRefillCountSince(1700000000000)
    expect(count).toBe(7)
  })

  it('should default to 0 when no rows come back', async () => {
    pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
    const count = await db.getRefillCountSince(1700000000000)
    expect(count).toBe(0)
  })
})

describe('when running under the refill advisory lock', () => {
  it('should run the body and release the lock when acquired', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ locked: true }] }) // pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [] }), // pg_advisory_unlock
      release: jest.fn()
    }
    ;(pg.getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(client) })

    const fn = jest.fn().mockResolvedValue('done')
    const result = await db.tryRunWithRefillLock(fn)

    expect(result).toEqual({ acquired: true, result: 'done' })
    expect(fn).toHaveBeenCalledTimes(1)
    // lock acquired + released, and the client returned to the pool.
    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('should not run the body when the lock is already held elsewhere', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ locked: false }] }),
      release: jest.fn()
    }
    ;(pg.getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue(client) })

    const fn = jest.fn()
    const result = await db.tryRunWithRefillLock(fn)

    expect(result).toEqual({ acquired: false })
    expect(fn).not.toHaveBeenCalled()
    // No unlock is issued (we never locked), but the client is still released.
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})
