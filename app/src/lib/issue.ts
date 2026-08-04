import { ethers } from 'ethers'
import {
  ContractName,
  ErrorCode,
  MetaTransactionError,
  getContract,
  sendMetaTransaction,
  type ContractData
} from 'decentraland-transactions'
import { metaTxProviderShim, readProvider } from '~/lib/authorizations'
import { gaslessConfig } from '~/lib/gasless-config'
import { ensureChain } from '~/lib/trades'
import { amoyGasOverrides } from '~/lib/trade-encoding'
import { confirmMetaTx } from '~/lib/tx-confirm'

// "Issue copies" — the creator generates fresh copies of their own published item and assigns them to
// wallets. This is the builder's "Mint Items" flow (src/components/Modals/MintItemsModal +
// modules/collection/sagas.ts handleMintCollectionItemsRequest), reframed web2-first: no NFT jargon,
// and — crucially — GASLESS.
//
// THE ON-CHAIN CALL (extracted from the builder, verbatim shape):
//   ERC721CollectionV2.issueTokens(address[] _beneficiaries, uint256[] _itemIds)
// One token is minted per array entry, so N copies to one address means repeating that
// address / itemId N times in the two index-aligned arrays (see buildIssueArgs). The builder fills
// `_itemIds` with the item's on-chain blockchain item id — the shop's PublishableItem.blockchainItemId.
// The collection CREATOR is always an allowed minter of their own collection, so no marketplace
// operator / setMinters grant is needed for a direct issue.
//
// WHY GASLESS: the builder sends this as a direct gas-paying tx. The shop must relay it as a
// meta-transaction — managed (Magic/thirdweb) wallets hold no POL, and self-custody wallets should
// never be forced onto the right chain / to pay gas. ERC721CollectionV2 supports native meta-tx (the
// fixed "Decentraland Collection" v2 domain — the same one setApprovalForAll / setMinters / transferFrom
// are relayed through), so this mirrors transferViaMetaTransaction in ~/lib/buy exactly.
const ISSUE_ABI = ['function issueTokens(address[] _beneficiaries, uint256[] _itemIds)']

// A single modal row: give `amount` copies of the item to `address`.
export type IssueEntry = { address: string; amount: number }

// A valid EVM address (checksum-less, mirroring the shop's TransferModal.isValidAddress and the
// builder's src/lib/address.ts isValid).
export function isValidIssueAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

// Sum of all copies requested across rows. Rows are floored at 0 so a blank/negative amount never
// under- or over-counts the running total.
export function totalToIssue(entries: IssueEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(0, Math.floor(e.amount || 0)), 0)
}

/**
 * Whether the rows form a valid, submittable batch:
 *  - at least one copy to issue,
 *  - every non-empty row has a valid address and amount ≥ 1,
 *  - the total does not exceed the item's remaining supply (max supply − already minted).
 * Empty rows (no address AND no amount) are ignored so a trailing blank row never blocks submit.
 */
export function isIssueValid(entries: IssueEntry[], available: number): boolean {
  const rows = entries.filter(e => e.address.trim().length > 0 || (e.amount || 0) > 0)
  if (rows.length === 0) return false
  for (const e of rows) {
    if (!isValidIssueAddress(e.address)) return false
    if (!Number.isInteger(e.amount) || e.amount < 1) return false
  }
  const total = totalToIssue(rows)
  return total >= 1 && total <= available
}

/**
 * Build the two parallel arrays issueTokens expects from the modal rows. N copies to one address =
 * push that address and itemId N times (matching the builder's sagas.ts:724-733 loop). The arrays are
 * index-aligned and their shared length is the total number of copies minted.
 *
 * @param itemId the item's on-chain blockchain item id (PublishableItem.blockchainItemId) — NOT the
 *   builder UUID. Encoded as uint256.
 */
export function buildIssueArgs(entries: IssueEntry[], itemId: string): { beneficiaries: string[]; itemIds: string[] } {
  const beneficiaries: string[] = []
  const itemIds: string[] = []
  for (const entry of entries) {
    const address = entry.address.trim()
    const n = Math.max(0, Math.floor(entry.amount || 0))
    if (!address || n === 0) continue
    for (let i = 0; i < n; i++) {
      beneficiaries.push(address)
      itemIds.push(itemId)
    }
  }
  return { beneficiaries, itemIds }
}

// Relay issueTokens as a Polygon native meta-transaction: the creator signs an off-chain EIP-712
// message and DCL's relayer submits it + pays the gas. Mirrors transferViaMetaTransaction (~/lib/buy):
// the meta-tx is signed against the collection's fixed ERC721CollectionV2 domain (only the address
// differs), and metaTxProviderShim routes signing to the wallet but every node read to the reliable
// target-chain RPC (never the wallet's flaky current-chain RPC).
async function issueViaMetaTransaction(opts: {
  contractAddress: string
  chainId: number
  beneficiaries: string[]
  itemIds: string[]
  signer: ethers.providers.JsonRpcSigner
}): Promise<string> {
  const { contractAddress, chainId, beneficiaries, itemIds, signer } = opts
  const collection: ContractData = {
    ...getContract(ContractName.ERC721CollectionV2, chainId),
    address: contractAddress
  }
  const functionData = new ethers.utils.Interface(ISSUE_ABI).encodeFunctionData('issueTokens', [beneficiaries, itemIds])
  const rpc = readProvider()
  const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
  const txHash = await sendMetaTransaction(provider, rpc, functionData, collection, {
    serverURL: gaslessConfig.relayerUrl
  })
  await confirmMetaTx(txHash, 'the mint')
  return txHash
}

/**
 * Issue copies of an item to one or more wallets in ONE batch. GASLESS FOR ALL (mirrors transferItem /
 * cancelListing): the relayer submits + pays gas, so managed wallets (no POL) can issue too, and it
 * sidesteps the wallet's chain RPC. Falls back to a direct (gas-paying) tx only if the relayer is
 * off / unreachable — but a user rejection propagates as a cancel instead of silently retrying with a
 * gas tx. Returns the tx hash.
 *
 * @param itemId the item's on-chain blockchain item id (PublishableItem.blockchainItemId).
 */
export async function issueTokens(opts: {
  signer: ethers.Signer
  contractAddress: string
  chainId: number
  entries: IssueEntry[]
  itemId: string
}): Promise<string> {
  const { signer, contractAddress, chainId, entries, itemId } = opts
  const { beneficiaries, itemIds } = buildIssueArgs(entries, itemId)
  if (beneficiaries.length === 0) throw new Error('No copies to issue')

  if (gaslessConfig.enabled) {
    try {
      return await issueViaMetaTransaction({
        contractAddress,
        chainId,
        beneficiaries,
        itemIds,
        signer: signer as ethers.providers.JsonRpcSigner
      })
    } catch (e) {
      // Creator dismissed the signature prompt → surface it as a cancel, don't retry with a gas tx.
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      console.warn('[issue] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  // Direct (gas-paying) fallback. issueTokens is a REAL transaction, so it must run on the collection's
  // chain — a restored session can leave the wallet on whatever network it last used; switch just-in-time.
  await ensureChain(signer.provider as ethers.providers.Web3Provider, chainId)
  const contract = new ethers.Contract(contractAddress, ISSUE_ABI, signer) as ethers.Contract & {
    issueTokens(
      beneficiaries: string[],
      itemIds: string[],
      overrides?: ethers.Overrides
    ): Promise<ethers.ContractTransaction>
  }
  const tx = await contract.issueTokens(beneficiaries, itemIds, amoyGasOverrides(chainId))
  const receipt = await tx.wait()
  return receipt.transactionHash
}
