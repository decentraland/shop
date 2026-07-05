import { Signer, providers } from 'ethers'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'

import { ITreasurySignerComponent, TreasuryTransactionRequest } from '../../types/components'

/**
 * Produces an ethers v5 `Signer` bound to an AWS KMS asymmetric key. Injected so the
 * production wiring can plug in a real KMS-backed signer (e.g. `@rumblefishdev/eth-signer-kms`
 * or `aws-kms-ethers-signer`) while tests inject a fake. Keeping this a factory means the
 * heavy AWS SDK dependency is never imported at module load and never in the test path.
 */
export type KmsSignerFactory = (params: {
  keyId: string
  region: string
  provider: providers.Provider
}) => Signer

/**
 * Production treasury signer backed by AWS KMS.
 *
 * The private key material NEVER leaves KMS: signing is a remote `kms:Sign` call over the
 * transaction digest, and the resulting secp256k1 signature is assembled into an Ethereum
 * signature by the underlying ethers `Signer` adapter. The service only ever holds the KMS
 * key id (an ARN/alias), never a seed or private key.
 *
 * How to complete for production (Phase 0 infra task in ROADMAP):
 *   1. Provision an asymmetric KMS key: KeyUsage=SIGN_VERIFY, Spec=ECC_SECG_P256K1.
 *   2. Grant the service's IAM role `kms:Sign` + `kms:GetPublicKey` on that key only.
 *   3. Pass a real {@link KmsSignerFactory} (a thin wrapper around a KMS ethers signer lib)
 *      when wiring this component. The rest of the treasury is already KMS-agnostic.
 *
 * Until a factory is supplied, this throws on construction — it will not silently fall back
 * to a local key.
 */
export async function createKmsTreasurySigner({
  config,
  logs,
  provider,
  kmsSignerFactory,
  confirmations = 1
}: {
  config: IConfigComponent
  logs: ILoggerComponent
  provider: providers.Provider
  kmsSignerFactory?: KmsSignerFactory
  confirmations?: number
}): Promise<ITreasurySignerComponent> {
  const logger = logs.getLogger('kms-treasury-signer')
  const keyId = await config.requireString('KMS_KEY_ID')
  const region = (await config.getString('AWS_REGION')) ?? 'us-east-1'

  if (!kmsSignerFactory) {
    throw new Error(
      'SIGNER_MODE=kms requires a KmsSignerFactory to be wired (production infra). ' +
        'No factory was provided — refusing to boot without real custody. See kms-signer.ts.'
    )
  }

  const signer = kmsSignerFactory({ keyId, region, provider })
  const address = await signer.getAddress()
  logger.info('Initialized KMS treasury signer', { address, keyId: maskKeyId(keyId), region })

  async function getAddress(): Promise<string> {
    return address
  }

  async function sendTransaction(tx: TreasuryTransactionRequest): Promise<{ hash: string }> {
    // The KMS signer signs the digest remotely inside sendTransaction; the key never
    // materializes locally. ethers populates nonce/gas from the bound provider.
    const sent = await signer.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value
    })
    // Confirm the tx mined without reverting before returning, so the refill flow never records
    // the ledger from — or fires a dependent leg on — an unconfirmed/reverted tx.
    const receipt = await sent.wait(confirmations)
    if (receipt.status === 0) {
      throw new Error(`KMS signer transaction reverted: ${sent.hash}`)
    }
    logger.info('KMS signer transaction confirmed', { hash: sent.hash, to: tx.to, block: receipt.blockNumber })
    return { hash: sent.hash }
  }

  return {
    getAddress,
    sendTransaction
  }
}

/** Logs never contain the full key id/ARN. */
function maskKeyId(keyId: string): string {
  if (keyId.length <= 8) {
    return '***'
  }
  return `${keyId.slice(0, 4)}...${keyId.slice(-4)}`
}
