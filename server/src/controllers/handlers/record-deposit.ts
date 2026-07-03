import { BigNumber } from 'ethers'

import { HandlerContextWithPath } from '../../types/system'
import { RecordDepositRequest } from '../schemas/record-deposit'

/**
 * Records a USDC deposit (pack purchase inflow) into the treasury ledger. Idempotent on
 * `reference`: a replayed payment webhook returns 200 with `alreadyRecorded: true` rather
 * than double-counting. First-time recording returns 201.
 *
 * Scope: this ONLY records the treasury inflow for reconciliation. Crediting the user's
 * balance is the credits-server's job — the payments flow calls both.
 */
export async function recordDepositHandler(
  context: HandlerContextWithPath<'reconcile' | 'logs', '/treasury/deposits'>
) {
  const {
    components: { reconcile, logs }
  } = context
  const logger = logs.getLogger('record-deposit')

  try {
    const body: RecordDepositRequest = await context.request.json()
    const usdcAmount = BigNumber.from(body.usdcAmount)

    const { entry, alreadyRecorded } = await reconcile.recordUsdcDeposit({
      usdcAmount,
      reference: body.reference,
      metadata: body.metadata
    })

    logger.info('USDC deposit recorded', { reference: body.reference, alreadyRecorded: String(alreadyRecorded) })

    return {
      status: alreadyRecorded ? 200 : 201,
      body: {
        id: entry.id,
        reference: entry.reference,
        usdcDelta: entry.usdcDelta,
        alreadyRecorded
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to record USDC deposit', { error: message })
    return {
      status: 500,
      body: { error: 'Failed to record deposit', message }
    }
  }
}
