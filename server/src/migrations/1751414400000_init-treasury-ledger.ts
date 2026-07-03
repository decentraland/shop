/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'

/**
 * Treasury ledger: append-only record of every treasury flow (USDC deposits, refills,
 * retained fees). Deltas are NUMERIC so 18-decimal MANA base units are stored exactly
 * (no float). Deposits are made idempotent by a partial unique index on (type, reference).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('treasury_ledger', {
    id: { type: 'uuid', primaryKey: true },
    type: { type: 'varchar(32)', notNull: true },
    // Signed deltas from the treasury's POV. NUMERIC(78,0) holds a full uint256 in base units.
    usdc_delta: { type: 'numeric(78,0)', notNull: true, default: '0' },
    mana_delta: { type: 'numeric(78,0)', notNull: true, default: '0' },
    reference: { type: 'text', notNull: false },
    metadata: { type: 'jsonb', notNull: false },
    // Milliseconds since epoch (matches Date.now()).
    created_at: { type: 'bigint', notNull: true }
  })

  pgm.createIndex('treasury_ledger', 'type')
  pgm.createIndex('treasury_ledger', 'created_at')

  // Idempotency: a given (type, reference) can only be recorded once. Partial so multiple
  // rows with NULL reference (e.g. fee entries without an external ref) are allowed.
  pgm.createIndex('treasury_ledger', ['type', 'reference'], {
    unique: true,
    where: 'reference IS NOT NULL',
    name: 'treasury_ledger_type_reference_uniq'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('treasury_ledger')
}
