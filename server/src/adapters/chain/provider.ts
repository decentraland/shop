import { ethers, providers } from 'ethers'
import { IConfigComponent } from '@well-known-components/interfaces'

/**
 * Builds the ethers v5 JSON-RPC provider used to read chain state and broadcast txs.
 *
 * Isolated in its own module so components accept a provider (or a factory) via DI and
 * tests can substitute a mock without any network. The refill/reconcile logic never
 * constructs a provider itself.
 */
export async function createRpcProvider({
  config
}: {
  config: IConfigComponent
}): Promise<providers.JsonRpcProvider> {
  const rpcUrl = await config.requireString('RPC_ENDPOINT_POLYGON')
  const chainId = await config.requireNumber('CHAIN_ID')
  // Passing the network avoids an eager eth_chainId round-trip at construction time,
  // which keeps boot deterministic and offline-safe in tests that never call the RPC.
  return new ethers.providers.JsonRpcProvider(rpcUrl, chainId)
}
