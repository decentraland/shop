import { ethers } from 'ethers'
import { ChainId, ProviderType } from '@dcl/schemas'
import {
  ContractName,
  getContract,
  sendMetaTransaction,
  MetaTransactionError,
  ErrorCode,
  type ContractData,
  type Provider
} from 'decentraland-transactions'
import { config } from '~/config'
import { gaslessConfig } from '~/lib/gasless-config'
import { showsWalletConfirmations } from '~/lib/wallet-kind'

// The shop's on-chain approvals ("authorizations"). Mirrors the marketplace's decentraland-dapps
// authorization model, trimmed to what the shop's flows actually touch:
//   - ALLOWANCE  — ERC20 approve(spender, amount): let the CreditsManager pull your balance to top up
//                  a purchase that credits don't fully cover.
//   - APPROVAL   — ERC721 setApprovalForAll(operator): let the marketplace transfer a collectible when
//                  it sells (required before listing an owned item).
//   - MINTER     — collection setMinters(operator): let the marketplace mint on a published collection
//                  (required before a primary/mint listing; creator-only).
export enum AuthorizationKind {
  Allowance = 'allowance',
  Approval = 'approval',
  Minter = 'minter'
}

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]
const ERC721_ABI = [
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)'
]
const COLLECTION_MINTER_ABI = [
  'function globalMinters(address minter) view returns (bool)',
  'function setMinters(address[] minters, bool[] values)'
]

// Unlimited ERC20 approval (2^256 - 1), matching the marketplace's getTokenAmountToApprove().
const MAX_ALLOWANCE = ethers.constants.MaxUint256

type Erc20Contract = ethers.Contract & {
  allowance(owner: string, spender: string): Promise<ethers.BigNumber>
  approve(spender: string, amount: ethers.BigNumberish): Promise<ethers.ContractTransaction>
}
type Erc721Contract = ethers.Contract & {
  isApprovedForAll(owner: string, operator: string): Promise<boolean>
  setApprovalForAll(operator: string, approved: boolean): Promise<ethers.ContractTransaction>
}
type CollectionMinterContract = ethers.Contract & {
  globalMinters(minter: string): Promise<boolean>
  setMinters(minters: string[], values: boolean[]): Promise<ethers.ContractTransaction>
}

// Read-only provider for the target chain — contract reads must not depend on the wallet's network.
export function readProvider() {
  return new ethers.providers.JsonRpcProvider(config.rpcUrl)
}

const AMOY_ADD_PARAMS = {
  chainId: '0x13882',
  chainName: 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://rpc-amoy.polygon.technology'],
  blockExplorerUrls: ['https://amoy.polygonscan.com']
}

// Silently move the wallet to the target chain — only needed just before an actual on-chain tx.
export async function ensureChain(provider: ethers.providers.Web3Provider, chainId: number): Promise<void> {
  const net = await provider.getNetwork()
  if (net.chainId === chainId) return
  const hexChain = ethers.utils.hexValue(chainId)
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: hexChain }])
  } catch (e) {
    if ((e as { code?: number }).code === 4902 && chainId === 80002) {
      await provider.send('wallet_addEthereumChain', [AMOY_ADD_PARAMS])
    } else {
      throw e
    }
  }
}

// A single on-chain authorization: a (kind, token/collection, operator/spender) triple on a chain.
export type ShopAuthorization = {
  kind: AuthorizationKind
  /** The token (ERC20) or collection (ERC721) contract being authorized. */
  contractAddress: string
  /** The operator/spender granted rights (e.g. the marketplace or the CreditsManager). */
  spenderAddress: string
  chainId: ChainId
}

// Read the current on-chain state of an authorization. For ALLOWANCE, "active" means a non-zero
// allowance; for APPROVAL/MINTER it's the boolean operator flag. Reads go through the target-chain
// RPC, never the wallet's current network.
export async function getAuthorizationStatus(auth: ShopAuthorization, owner: string): Promise<boolean> {
  const provider = readProvider()
  switch (auth.kind) {
    case AuthorizationKind.Allowance: {
      const erc20 = new ethers.Contract(auth.contractAddress, ERC20_ABI, provider) as Erc20Contract
      const allowance = await erc20.allowance(owner, auth.spenderAddress)
      return allowance.gt(0)
    }
    case AuthorizationKind.Approval: {
      const erc721 = new ethers.Contract(auth.contractAddress, ERC721_ABI, provider) as Erc721Contract
      return erc721.isApprovedForAll(owner, auth.spenderAddress)
    }
    case AuthorizationKind.Minter: {
      const collection = new ethers.Contract(
        auth.contractAddress,
        COLLECTION_MINTER_ABI,
        provider
      ) as CollectionMinterContract
      try {
        return await collection.globalMinters(auth.spenderAddress)
      } catch {
        return false
      }
    }
  }
}

// The ERC-712 domain the meta-tx is signed against depends on the target contract. MANA carries its
// own name/version in decentraland-transactions; every DCL collection (ERC721 or the minter surface)
// shares the fixed ERC721CollectionV2 domain (name "Decentraland Collection", version "2") — only the
// address differs, so we take that template and override the address with the specific collection.
function metaTxContractData(auth: ShopAuthorization): ContractData {
  if (auth.kind === AuthorizationKind.Allowance) {
    return getContract(ContractName.MANAToken, auth.chainId)
  }
  return { ...getContract(ContractName.ERC721CollectionV2, auth.chainId), address: auth.contractAddress }
}

// The calldata the meta-tx wraps — the same call the direct-tx path below would send.
function encodeAuthorizationCall(auth: ShopAuthorization, active: boolean): string {
  const iface = new ethers.utils.Interface(
    auth.kind === AuthorizationKind.Allowance
      ? ERC20_ABI
      : auth.kind === AuthorizationKind.Approval
        ? ERC721_ABI
        : COLLECTION_MINTER_ABI
  )
  switch (auth.kind) {
    case AuthorizationKind.Allowance:
      return iface.encodeFunctionData('approve', [auth.spenderAddress, active ? MAX_ALLOWANCE : ethers.constants.Zero])
    case AuthorizationKind.Approval:
      return iface.encodeFunctionData('setApprovalForAll', [auth.spenderAddress, active])
    case AuthorizationKind.Minter:
      return iface.encodeFunctionData('setMinters', [[auth.spenderAddress], [active]])
  }
}

// Submit the grant/revoke as a Polygon native meta-transaction: the wallet signs an off-chain EIP-712
// message and DCL's relayer submits it and pays the gas. Mirrors the gasless buy path (lib/buy-gasless)
// and uses decentraland-transactions' sendMetaTransaction, which picks the right meta-tx variant from
// the contract ABI (MANA/collection classic type vs the CreditsManager offchain type). Throws if the
// relayer/flow is unavailable so the caller can fall back to a direct tx.
async function grantViaMetaTransaction(
  auth: ShopAuthorization,
  signer: ethers.providers.JsonRpcSigner,
  active: boolean
) {
  const functionData = encodeAuthorizationCall(auth, active)
  const contractData = metaTxContractData(auth)
  // The wallet's Web3Provider signs; the target-chain RPC reads the meta-tx nonce AND waits for the
  // relayed receipt — one instance shared for both.
  const walletProvider = signer.provider as unknown as Provider
  const rpc = readProvider()
  const txHash = await sendMetaTransaction(walletProvider, rpc, functionData, contractData, {
    serverURL: gaslessConfig.relayerUrl
  })
  await rpc.waitForTransaction(txHash, 1, 120_000)
}

// Grant (active=true) or revoke (active=false) an authorization. GASLESS FOR EVERY WALLET: the wallet
// signs an off-chain meta-transaction and DCL's relayer submits it and pays the gas, so nobody needs
// POL — this mirrors how the marketplace relays Polygon actions. Managed (Magic/thirdweb) wallets hold
// no gas at all, so this is the only path that works for them (a direct tx reverts with
// INSUFFICIENT_FUNDS). If the relayer is off (flag) / unreachable / the signer is a contract account,
// we fall back to a direct (gas-paying) tx — unless the user rejected the signature, which propagates.
// Grant of an ALLOWANCE uses an unlimited amount; revoke sets it to 0.
export async function setAuthorization(opts: {
  auth: ShopAuthorization
  signer: ethers.providers.JsonRpcSigner
  active: boolean
}): Promise<void> {
  const { auth, signer, active } = opts

  if (gaslessConfig.enabled) {
    try {
      await grantViaMetaTransaction(auth, signer, active)
      return
    } catch (e) {
      // User dismissed the signature prompt → surface it, don't silently retry with a direct tx.
      if (e instanceof MetaTransactionError && e.code === ErrorCode.USER_DENIED) throw e
      // Relayer down / contract account / flag off → fall through to a direct (gas-paying) tx. Log it
      // so the fallback (and any managed wallet that then hits INSUFFICIENT_FUNDS) is diagnosable.
      console.warn('[authorizations] gasless meta-tx failed, falling back to a direct tx:', e)
    }
  }

  await ensureChain(signer.provider as ethers.providers.Web3Provider, auth.chainId)
  switch (auth.kind) {
    case AuthorizationKind.Allowance: {
      const erc20 = new ethers.Contract(auth.contractAddress, ERC20_ABI, signer) as Erc20Contract
      const tx = await erc20.approve(auth.spenderAddress, active ? MAX_ALLOWANCE : ethers.constants.Zero)
      await tx.wait()
      return
    }
    case AuthorizationKind.Approval: {
      const erc721 = new ethers.Contract(auth.contractAddress, ERC721_ABI, signer) as Erc721Contract
      const tx = await erc721.setApprovalForAll(auth.spenderAddress, active)
      await tx.wait()
      return
    }
    case AuthorizationKind.Minter: {
      const collection = new ethers.Contract(
        auth.contractAddress,
        COLLECTION_MINTER_ABI,
        signer
      ) as CollectionMinterContract
      const tx = await collection.setMinters([auth.spenderAddress], [active])
      await tx.wait()
      return
    }
  }
}

// Pre-action guard: make sure an authorization is in place before running an action. Reads the current
// state via the target-chain RPC and, only if missing, sends the grant (a gasless meta-tx, so no wallet
// needs POL). No-op when already authorized — this is the fetch-then-grant guard, so we never ask for
// an approval that's already in place.
export async function ensureAuthorization(opts: {
  auth: ShopAuthorization
  signer: ethers.providers.JsonRpcSigner
}): Promise<void> {
  const owner = await opts.signer.getAddress()
  const authorized = await getAuthorizationStatus(opts.auth, owner)
  if (authorized) return
  await setAuthorization({ auth: opts.auth, signer: opts.signer, active: true })
}

// Whether a first-time approval STEP should be surfaced in the UI before an action. Only self-custody
// (web3) users ever see it — and only when the authorization is actually missing. Managed (web2) users
// never see approval wording (CONVENTIONS.md); their grant, if any, happens silently under the hood.
export function needsApprovalStep(providerType: ProviderType | null | undefined, isAuthorized: boolean): boolean {
  return showsWalletConfirmations(providerType) && !isAuthorized
}

// Descriptor for a row on the Authorizations page: an authorization plus the metadata the UI needs to
// label and key it. `group` mirrors the marketplace Settings page's "for buying" / "for selling"
// grouping; `id` is a stable key for i18n + react-query.
export type ShopAuthorizationDescriptor = ShopAuthorization & {
  id: string
  group: 'buying' | 'selling'
}

// The one fixed, account-level authorization the shop uses: letting the CreditsManager spend your
// balance to top up a purchase that credits don't fully cover. Always shown on the page.
export function getCreditsAuthorization(chainId: ChainId): ShopAuthorizationDescriptor {
  const mana = getContract(ContractName.MANAToken, chainId)
  const creditsManager = getContract(ContractName.CreditsManager, chainId)
  return {
    id: 'credits',
    group: 'buying',
    kind: AuthorizationKind.Allowance,
    contractAddress: mana.address,
    spenderAddress: creditsManager.address,
    chainId
  }
}

// The per-collection selling authorization: letting the marketplace transfer collectibles from this
// collection when they sell. One row per collection the user owns collectibles in.
export function getCollectionSellingAuthorization(
  contractAddress: string,
  chainId: ChainId
): ShopAuthorizationDescriptor {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  return {
    id: `selling:${contractAddress.toLowerCase()}`,
    group: 'selling',
    kind: AuthorizationKind.Approval,
    contractAddress,
    spenderAddress: market.address,
    chainId
  }
}
