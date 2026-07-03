import { Wallet, providers } from 'ethers'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'

import { ITreasurySignerComponent, TreasuryTransactionRequest } from '../../types/components'

/**
 * DEV-ONLY treasury signer backed by a local private key from env (`DEV_TREASURY_PRIVATE_KEY`).
 *
 * WARNING: This holds a raw private key in process memory. It exists solely to exercise
 * the Amoy testnet path end-to-end (real swaps have no liquidity on Amoy, but transfers
 * and funding do). It MUST NEVER run in production — the guard lives in the signer factory
 * and the treasury-config component (NODE_ENV!==production AND ALLOW_DEV_SIGNER=true).
 *
 * Production custody is KMS/MPC/HSM only; see {@link createKmsTreasurySigner}.
 */
export async function createDevTreasurySigner({
  config,
  logs,
  provider
}: {
  config: IConfigComponent
  logs: ILoggerComponent
  provider: providers.Provider
}): Promise<ITreasurySignerComponent> {
  const logger = logs.getLogger('dev-treasury-signer')
  const privateKey = await config.requireString('DEV_TREASURY_PRIVATE_KEY')

  const wallet = new Wallet(privateKey, provider)
  logger.warn('Using DEV treasury signer (local key). This is UNSAFE for production.', {
    address: wallet.address
  })

  async function getAddress(): Promise<string> {
    return wallet.address
  }

  async function sendTransaction(tx: TreasuryTransactionRequest): Promise<{ hash: string }> {
    const sent = await wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value
    })
    logger.info('Dev signer broadcast transaction', { hash: sent.hash, to: tx.to })
    return { hash: sent.hash }
  }

  return {
    getAddress,
    sendTransaction
  }
}
