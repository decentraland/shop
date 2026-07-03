import { ethers } from 'ethers'
import type { TradeCreation } from '@dcl/schemas'
import { generateTradeValues } from './prepare'
import type { PreparedTrade } from './prepare'

// The single seam where the ORIGINAL SELLER's wallet plugs in (MIGRATION_SPEC §4). A migrated
// listing needs a new EIP-712 signature that only the seller's key can produce — no server/admin
// key works. Everything else in the tool is automatable; this interface isolates the one part that
// is not.

export interface MigrationSigner {
  // Produce the signed TradeCreation from the prepared (unsigned) payload. In the Shop UI this wraps
  // the connected seller's wallet (signer._signTypedData); in a CLI test it could wrap a local key.
  signTrade(prepared: PreparedTrade): Promise<TradeCreation>
  // Optional: cancel the old classic listing on-chain (marketplace.cancelSignature). Only the
  // seller can cancel their own listing. Returns a tx ref.
  cancelOld?(oldTradeId: string): Promise<string>
}

/**
 * Dry-run signer: signs nothing, cancels nothing. Used by --dry-run so the pipeline runs end-to-end
 * (enumerate → price → prepare → report) with zero wallet interaction.
 */
export class NullSigner implements MigrationSigner {
  async signTrade(): Promise<TradeCreation> {
    throw new Error('NullSigner cannot sign — this is a dry run. Inject a wallet-backed signer to post.')
  }
}

/**
 * Wrap an ethers v5 signer (the seller's wallet) as a MigrationSigner. This is what the Shop UI
 * injects: `walletSignerFromEthers(await web3Provider.getSigner())`. Uses the exact same
 * generateTradeValues + domain/types as the Shop app, so the signature verifies on-chain.
 *
 * A `cancelOld` implementation is intentionally left to the caller (it needs the full old Trade
 * object + marketplace ABI, mirroring shop/app/src/lib/buy.ts:cancelListing) — pass one in if the
 * run should also take down the classic listing.
 */
export function walletSignerFromEthers(
  ethersSigner: ethers.Signer & { _signTypedData: ethers.providers.JsonRpcSigner['_signTypedData'] },
  cancelOld?: (oldTradeId: string) => Promise<string>
): MigrationSigner {
  return {
    async signTrade(prepared: PreparedTrade): Promise<TradeCreation> {
      const signature = await ethersSigner._signTypedData(
        prepared.domain,
        prepared.types,
        generateTradeValues(prepared.trade)
      )
      return { ...prepared.trade, signature }
    },
    cancelOld
  }
}
