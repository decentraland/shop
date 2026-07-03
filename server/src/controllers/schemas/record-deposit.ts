import type { Schema } from 'ajv'

/**
 * Request body for POST /treasury/deposits — the payments flow records a USDC inflow from
 * a pack purchase. The actual crediting of the user lives in the credits-server; here we
 * only record the treasury inflow for reconciliation.
 */
export type RecordDepositRequest = {
  /** USDC amount received, in base units (6 decimals), as a decimal string (uint-safe). */
  usdcAmount: string
  /** External payment reference (Stripe payment intent / onramp id). Dedupe key. */
  reference: string
  /** Optional free-form metadata (never secrets). */
  metadata?: Record<string, unknown>
}

export const RecordDepositRequestSchema: Schema = {
  type: 'object',
  properties: {
    usdcAmount: {
      type: 'string',
      // A positive integer string (base units). Rejects negatives, decimals, and empties.
      pattern: '^[1-9][0-9]*$',
      description: 'USDC received in base units (6 decimals)'
    },
    reference: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      description: 'External payment reference; deposits are idempotent on this'
    },
    metadata: {
      type: 'object',
      description: 'Optional non-sensitive metadata',
      additionalProperties: true
    }
  },
  required: ['usdcAmount', 'reference'],
  additionalProperties: false
}
