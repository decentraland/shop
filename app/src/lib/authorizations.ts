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
import { canPayGasItself, showsWalletConfirmations } from '~/lib/wallet-kind'
import { confirmMetaTx } from '~/lib/tx-confirm'
import { captureError } from '~/lib/monitoring'
import { activeChainId, requireChain } from '~/lib/network'
import { useWallet } from '~/store/wallet'

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
/**
 * Is this authorization already in place?
 *
 * `requiredWei` matters for an ALLOWANCE, which is an amount and not a flag. Asked without it the answer is
 * only "some allowance exists", and a leftover approval from a cheaper purchase passes — so the caller skips
 * its approval step, and then the purchase prompts for one anyway when it finds the allowance too small.
 * That is a buyer signing twice with only the second signature explained.
 *
 * A NON-POSITIVE amount falls back to that amountless question rather than being asked literally: `gte(0)`
 * holds for every allowance, including none at all, so a caller that could not size the purchase would get
 * a zero allowance reported as approved — weaker than asking nothing. No caller can defeat the check by
 * passing 0.
 */
export async function getAuthorizationStatus(
  auth: ShopAuthorization,
  owner: string,
  requiredWei?: bigint
): Promise<boolean> {
  const provider = readProvider()
  switch (auth.kind) {
    case AuthorizationKind.Allowance: {
      const erc20 = new ethers.Contract(auth.contractAddress, ERC20_ABI, provider) as Erc20Contract
      const allowance = await erc20.allowance(owner, auth.spenderAddress)
      // No usable amount → the old question ("is there any?"), for callers with nothing to spend yet.
      if (requiredWei == null || requiredWei <= 0n) return allowance.gt(0)
      return allowance.gte(requiredWei.toString())
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

// RPC methods that MUST go to the connected wallet (signing + account list) — all RPC-free. Everything
// else is a node read.
const WALLET_RPC_METHODS = new Set([
  'eth_signTypedData_v4',
  'eth_signTypedData',
  'eth_sign',
  'personal_sign',
  'eth_requestAccounts',
  'eth_accounts',
  'eth_chainId'
])

// A provider shim for sendMetaTransaction so the meta-tx NEVER depends on the wallet's current-chain
// RPC. sendMetaTransaction reads the account (eth_accounts) and does a contract-account check
// (eth_getCode) through the provider it's given; if that's the wallet's provider and the user is
// connected to some flaky network (e.g. Sepolia while listing on Amoy), that eth_getCode hits the
// wallet's rate-limited RPC and fails with -32002, killing an otherwise off-chain-signed gasless tx.
// So: route signing + account list to the wallet (RPC-free), and every node read to the reliable
// target-chain RPC. The nonce is read via metaTxProvider (the same rpc) separately.
export function metaTxProviderShim(
  wallet: ethers.providers.Web3Provider,
  rpc: ethers.providers.JsonRpcProvider
): Provider {
  return {
    send: (method: string, params: unknown[] = []) =>
      WALLET_RPC_METHODS.has(method) ? wallet.send(method, params) : rpc.send(method, params)
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
  const rpc = readProvider()
  // The shim signs via the wallet but sends node reads (account-code check, etc.) to `rpc`, so the
  // meta-tx works regardless of which network the wallet is on. `rpc` also reads the nonce + waits for
  // the relayed receipt.
  const provider = metaTxProviderShim(signer.provider as ethers.providers.Web3Provider, rpc)
  const txHash = await sendMetaTransaction(provider, rpc, functionData, contractData, {
    serverURL: gaslessConfig.relayerUrl
  })
  await confirmMetaTx(txHash, 'the authorization')
}

/**
 * Who the current session signs with, read from the store rather than threaded through eight call sites.
 *
 * Same shape as `analytics`, `monitoring` and `purchase-report`, and for the same reason: `ensureAuthorization`
 * is reached from the cart, both listing flows, the import tool, the MANA rails and the Authorizations page, and
 * a parameter every one of them has to remember to pass is a parameter one of them will forget. Read
 * defensively — an authorization can outlive the session that started it.
 *
 * Unknown answers `null`, which `canPayGasItself` reads as managed: the safe direction, since the failure this
 * guards against is offering a gas-paying transaction to a wallet that holds no gas.
 */
function activeProviderType(): ProviderType | null {
  try {
    return useWallet.getState().session?.providerType ?? null
  } catch {
    return null
  }
}

/** Is the wallet already on `chainId`? The question `requireChain` answers by throwing. */
async function isOnChain(signer: ethers.providers.JsonRpcSigner, chainId: number): Promise<boolean> {
  try {
    return (await activeChainId(signer.provider as ethers.providers.Web3Provider)) === chainId
  } catch {
    // An unreadable chain answers "no": the direct rail cannot be offered on a guess, and the caller's
    // fallback here is to surface the real cause, which is never worse than a wrong "yes".
    return false
  }
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
      //
      // Deliberately NO MetaTxPendingError guard here, unlike the purchase/transfer/mint paths: all three
      // calls this builds ASSIGN a fixed value — approve to MaxUint256 or 0, setApprovalForAll and
      // setMinters to a boolean — so a pending relay plus a direct re-submission lands on the same state
      // instead of applying the operation twice.
      //
      /**
       * IS THE DIRECT RAIL A ROUTE THIS BUYER HAS? Asked BEFORE offering it, because reaching it and failing
       * replaces the real cause with a symptom.
       *
       * What this cost: a wallet whose signing popup timed out got `MetaTransactionError(UNKNOWN)` —
       * `sendMetaTransaction` classifies denials by matching the literal string "User denied message
       * signature" and calls everything else UNKNOWN — so the guard above missed it, this fell through, and
       * `requireChain` refused because that wallet was on Ethereum. The person was shown "your wallet is on
       * Ethereum, this runs on Polygon" for a confirmation window that had closed. Two errors, and the one
       * they saw was neither the cause nor actionable: the relayed rail signs off-chain and works from ANY
       * network, so retrying it was the fix and switching networks was irrelevant advice.
       *
       * So both conditions are checked here rather than discovered downstream, and when either fails the
       * ORIGINAL gasless error propagates — the one that says what actually happened.
       */
      const canPayGas = canPayGasItself(activeProviderType())
      const onRightChain = canPayGas && (await isOnChain(signer, auth.chainId))
      if (!canPayGas || !onRightChain) {
        // Its own step: "the relay failed AND there was no second route" is a different event from "the
        // relay failed and we fell back", and only one of them ends with the buyer unable to continue.
        captureError(e, {
          flow: 'authorizations',
          step: 'gasless_no_fallback',
          reason: canPayGas ? 'wrong-chain' : 'managed-wallet'
        })
        throw e
      }
      // Relayer down / contract account / flag off, and this buyer can actually take the gas rail.
      captureError(e, { flow: 'authorizations', step: 'gasless_fallback' })
    }
  }

  // Direct (gas-paying) fallback: the WALLET broadcasts this one, so it must already be on the right chain.
  // We only check — moving it is the user's decision, made from the navbar's network control. The check above
  // has already established this passes when we get here from the relayed rail; it still guards the
  // gasless-disabled path, and a wallet that switched networks mid-flight.
  await requireChain(signer.provider as ethers.providers.Web3Provider, auth.chainId)
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
  /**
   * What the action is about to spend, for an ALLOWANCE. Without it this asks only whether SOME allowance
   * exists, so one left over from a cheaper purchase passes, no approve is sent, and the marketplace
   * `accept` / store `buy` then reverts on transferFrom. Managed wallets hit that with no approval step in
   * front of it at all, so there is nothing for the buyer to read either.
   */
  requiredWei?: bigint
}): Promise<void> {
  const owner = await opts.signer.getAddress()
  const authorized = await getAuthorizationStatus(opts.auth, owner, opts.requiredWei)
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
  group: 'buying' | 'selling' | 'minting'
}

/**
 * Letting a contract pull the buyer's MANA. The spender depends on the rail: the MARKETPLACE for a
 * MANA-only purchase (it moves the MANA itself), the CREDITSMANAGER for a mixed credits + MANA one (see
 * getCreditsAuthorization). Callers pass the spender their rail actually uses, so the approval the UI
 * announces is byte-for-byte the one the purchase needs.
 */
export function getManaSpendingAuthorization(chainId: ChainId, spenderAddress: string): ShopAuthorization {
  const mana = getContract(ContractName.MANAToken, chainId)
  return { kind: AuthorizationKind.Allowance, contractAddress: mana.address, spenderAddress, chainId }
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

/**
 * Letting the MARKETPLACE pull MANA — the allowance a MANA-only purchase grants (the mixed rail uses the
 * CreditsManager instead, see getCreditsAuthorization). It belongs on the Approvals page for the same
 * reason as any other: a permission the shop asks for has to be visible and revocable, and paying in MANA
 * grants one that was previously listed nowhere.
 */
export function getManaMarketplaceAuthorization(chainId: ChainId): ShopAuthorizationDescriptor {
  const mana = getContract(ContractName.MANAToken, chainId)
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  return {
    id: 'mana-marketplace',
    group: 'buying',
    kind: AuthorizationKind.Allowance,
    contractAddress: mana.address,
    spenderAddress: market.address,
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

// The per-collection minting authorization: letting the marketplace mint items from this collection
// when a primary/mint listing sells. One row per collection the creator PUBLISHES from. Mirrors the
// silent grant `ensureMinter` (lib/trades) does at publish time — the operator is the same offchain
// marketplace that mints — so surfacing it here lets a creator SEE and REVOKE that mint right.
export function getCollectionMintingAuthorization(
  contractAddress: string,
  chainId: ChainId
): ShopAuthorizationDescriptor {
  const market = getContract(ContractName.OffChainMarketplaceV2, chainId)
  return {
    id: `minting:${contractAddress.toLowerCase()}`,
    group: 'minting',
    kind: AuthorizationKind.Minter,
    contractAddress,
    spenderAddress: market.address,
    chainId
  }
}
