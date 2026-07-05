import { randomUUID } from 'node:crypto'

import { IPgComponent } from '@well-known-components/pg-component'
import SQL from 'sql-template-strings'

import {
  IDbComponent,
  LedgerEntry,
  LedgerEntryType,
  LedgerSummary,
  NewLedgerEntry
} from '../../types/components'

type LedgerRow = {
  id: string
  type: LedgerEntryType
  usdc_delta: string
  mana_delta: string
  reference: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

function mapRow(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    type: row.type,
    usdcDelta: row.usdc_delta,
    manaDelta: row.mana_delta,
    reference: row.reference,
    metadata: row.metadata,
    createdAt: Number(row.created_at)
  }
}

/**
 * Postgres-backed treasury ledger adapter.
 *
 * `treasury_ledger` is append-only: every USDC deposit, refill, and retained fee is one row
 * with signed usdc/mana deltas (NUMERIC to hold 18dp MANA base units without float loss).
 * Deposits are idempotent on (type, reference) via a partial unique index, so replaying a
 * Stripe webhook can't double-count an inflow.
 */
export async function createDbAdapter({ pg }: { pg: IPgComponent }): Promise<IDbComponent> {
  /**
   * Inserts a ledger entry. For USDC deposits with a reference, uses ON CONFLICT DO NOTHING
   * against the partial unique index and, on conflict, re-reads and returns the existing
   * row with `inserted: false` — making deposit recording safely idempotent.
   */
  async function insertLedgerEntry(entry: NewLedgerEntry): Promise<{ entry: LedgerEntry; inserted: boolean }> {
    const id = randomUUID()
    const createdAt = Date.now()
    const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null

    const insert = SQL`
      INSERT INTO treasury_ledger (id, type, usdc_delta, mana_delta, reference, metadata, created_at)
      VALUES (
        ${id},
        ${entry.type},
        ${entry.usdcDelta}::numeric,
        ${entry.manaDelta}::numeric,
        ${entry.reference},
        ${metadataJson}::jsonb,
        ${createdAt}
      )
      ON CONFLICT (type, reference) WHERE reference IS NOT NULL DO NOTHING
      RETURNING id, type, usdc_delta, mana_delta, reference, metadata, created_at
    `

    const result = await pg.query<LedgerRow>(insert)
    if (result.rows.length > 0) {
      return { entry: mapRow(result.rows[0]), inserted: true }
    }

    // Conflict: an entry with this (type, reference) already exists — return it.
    const existing = await pg.query<LedgerRow>(SQL`
      SELECT id, type, usdc_delta, mana_delta, reference, metadata, created_at
      FROM treasury_ledger
      WHERE type = ${entry.type} AND reference = ${entry.reference}
      LIMIT 1
    `)
    return { entry: mapRow(existing.rows[0]), inserted: false }
  }

  async function getLedgerSummary(): Promise<LedgerSummary> {
    const result = await pg.query<{
      total_usdc_deposited: string | null
      total_usdc_spent: string | null
      total_mana_acquired: string | null
      total_mana_transferred: string | null
      total_fee_retained_mana: string | null
      entry_count: string
    }>(SQL`
      SELECT
        COALESCE(SUM(usdc_delta) FILTER (WHERE type = ${LedgerEntryType.USDC_DEPOSIT}), 0)::text AS total_usdc_deposited,
        COALESCE(-SUM(usdc_delta) FILTER (WHERE type = ${LedgerEntryType.REFILL}), 0)::text AS total_usdc_spent,
        COALESCE(SUM((metadata->>'manaAcquired')::numeric) FILTER (WHERE type = ${LedgerEntryType.REFILL}), 0)::text AS total_mana_acquired,
        COALESCE(SUM(mana_delta) FILTER (WHERE type = ${LedgerEntryType.REFILL}), 0)::text AS total_mana_transferred,
        COALESCE(SUM(mana_delta) FILTER (WHERE type = ${LedgerEntryType.FEE_RETAINED}), 0)::text AS total_fee_retained_mana,
        COUNT(*)::text AS entry_count
      FROM treasury_ledger
    `)

    const row = result.rows[0]
    const totalUsdcDeposited = row.total_usdc_deposited ?? '0'
    const totalUsdcSpent = row.total_usdc_spent ?? '0'
    const totalManaAcquired = row.total_mana_acquired ?? '0'
    const totalManaTransferred = row.total_mana_transferred ?? '0'
    const totalFeeRetainedMana = row.total_fee_retained_mana ?? '0'

    return {
      expectedTreasuryUsdc: (BigInt(totalUsdcDeposited) - BigInt(totalUsdcSpent)).toString(),
      expectedCreditsManagerMana: totalManaTransferred,
      totalUsdcDeposited,
      totalUsdcSpent,
      totalManaAcquired,
      totalManaTransferred,
      totalFeeRetainedMana,
      entryCount: Number(row.entry_count)
    }
  }

  async function getRecentEntries(limit: number): Promise<LedgerEntry[]> {
    const result = await pg.query<LedgerRow>(SQL`
      SELECT id, type, usdc_delta, mana_delta, reference, metadata, created_at
      FROM treasury_ledger
      ORDER BY created_at DESC
      LIMIT ${limit}
    `)
    return result.rows.map(mapRow)
  }

  async function getRefillCountSince(sinceMs: number): Promise<number> {
    const result = await pg.query<{ count: string }>(SQL`
      SELECT COUNT(*)::text AS count
      FROM treasury_ledger
      WHERE type = ${LedgerEntryType.REFILL} AND created_at >= ${sinceMs}
    `)
    return Number(result.rows[0]?.count ?? '0')
  }

  async function tryRunWithRefillLock<T>(
    fn: () => Promise<T>
  ): Promise<{ acquired: true; result: T } | { acquired: false }> {
    // Session-level advisory lock (not xact) so it is held across the refill's multiple awaits/txs.
    // Must acquire + release on the SAME connection, so grab a dedicated client from the pool.
    const client = await pg.getPool().connect()
    try {
      const lockRes = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [
        REFILL_ADVISORY_LOCK_KEY
      ])
      if (!lockRes.rows[0]?.locked) {
        return { acquired: false }
      }
      try {
        const result = await fn()
        return { acquired: true, result }
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [REFILL_ADVISORY_LOCK_KEY])
      }
    } finally {
      client.release()
    }
  }

  return {
    insertLedgerEntry,
    getLedgerSummary,
    getRecentEntries,
    getRefillCountSince,
    tryRunWithRefillLock
  }
}

// Arbitrary but fixed 64-bit key identifying the treasury-refill advisory lock. Any other process
// using pg_advisory_lock must not reuse it.
const REFILL_ADVISORY_LOCK_KEY = 4736251009
