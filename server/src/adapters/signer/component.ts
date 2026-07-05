import { providers } from 'ethers'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'

import { ITreasuryConfigComponent, ITreasurySignerComponent } from '../../types/components'
import { SignerMode } from '../../logic/config/types'

import { createDevTreasurySigner } from './dev-signer'
import { createKmsTreasurySigner, KmsSignerFactory } from './kms-signer'

/**
 * Selects and constructs the treasury signer based on `treasuryConfig.signerMode`.
 *
 * Selection is the ONLY place custody backends are chosen; the treasury logic depends on
 * the {@link ITreasurySignerComponent} interface and is unaware of KMS vs local key. The
 * dangerous dev path is doubly guarded: the config component already refuses SIGNER_MODE=dev
 * outside a guarded dev env, and this factory re-asserts the same invariant so the check
 * can't be bypassed by wiring the factory directly.
 */
export async function createTreasurySignerComponent({
  config,
  logs,
  provider,
  treasuryConfig,
  kmsSignerFactory
}: {
  config: IConfigComponent
  logs: ILoggerComponent
  provider: providers.Provider
  treasuryConfig: ITreasuryConfigComponent
  kmsSignerFactory?: KmsSignerFactory
}): Promise<ITreasurySignerComponent> {
  const { signerMode } = treasuryConfig.get()

  // Every value-moving tx is awaited to this many confirmations and its receipt status checked
  // before the signer returns, so callers never build the ledger from an unconfirmed/reverted tx
  // and sequential legs (approve → swap → transfer) can't race. Default 1. Must be a positive
  // integer: ethers' `wait(0)` can resolve a null receipt, which would break the status check on
  // every tx — so a non-positive/non-integer value falls back to 1 rather than silently breaking.
  const rawConfirmations = await config.getNumber('TREASURY_TX_CONFIRMATIONS')
  const confirmations = Number.isInteger(rawConfirmations) && (rawConfirmations as number) > 0 ? rawConfirmations : 1

  if (signerMode === SignerMode.DEV) {
    await assertDevSignerAllowed(config)
    return createDevTreasurySigner({ config, logs, provider, confirmations })
  }

  return createKmsTreasurySigner({ config, logs, provider, kmsSignerFactory, confirmations })
}

/**
 * Re-checks the dev-signer guard at construction time. Redundant with the config
 * component by design: custody is high-stakes, so the "never a raw key in production"
 * rule is enforced at every layer that could enable it.
 *
 * @throws if NODE_ENV is production or ALLOW_DEV_SIGNER is not exactly 'true'.
 */
async function assertDevSignerAllowed(config: IConfigComponent): Promise<void> {
  const nodeEnv = (await config.getString('NODE_ENV')) ?? 'development'
  const allowDevSigner = (await config.getString('ALLOW_DEV_SIGNER')) === 'true'
  if (nodeEnv === 'production' || !allowDevSigner) {
    throw new Error(
      'Refusing to construct the dev treasury signer: requires NODE_ENV!==production AND ALLOW_DEV_SIGNER=true.'
    )
  }
}
