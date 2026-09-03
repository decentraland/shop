import { ethers } from 'ethers'

// Minimal JSON-RPC responder for the app's read provider (config.rpcUrl). Returns canned, ABI-encoded
// results so contract reads resolve WITHOUT a real chain: "already approved / already a minter" (so
// no on-chain tx is ever needed in the happy paths) + the MANA/USD oracle rate.

const MOCK_ORACLE = '0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e'
export const ORACLE_RATE = 26960836 // ~$0.2696 at 8 decimals (the Amoy mock aggregator)
const abi = ethers.utils.defaultAbiCoder
const sel = (sig: string) => ethers.utils.id(sig).slice(0, 10)

const SELECTORS = {
  balanceOf: sel('balanceOf(address)'),
  allowance: sel('allowance(address,address)'),
  contractSignatureIndex: sel('contractSignatureIndex()'),
  signerSignatureIndex: sel('signerSignatureIndex(address)'),
  globalMinters: sel('globalMinters(address)'),
  isApprovedForAll: sel('isApprovedForAll(address,address)'),
  manaUsdAggregator: sel('manaUsdAggregator()'),
  decimals: sel('decimals()'),
  latestRoundData: sel('latestRoundData()'),
  getNonce: sel('getNonce(address)') // CreditsManager meta-tx nonce (gasless checkout)
}

// The MANA balance the mocked ERC20 reports for balanceOf — set per test via launchApp({ manaBalanceWei }).
// '0' (the default) means the wallet holds no MANA, so the MANA payment rails are never offered and the
// shop behaves exactly as it did before they existed.
let manaBalanceWei = '0'
export function setManaBalanceWei(wei: string) {
  manaBalanceWei = wei
}

// MANA on Ethereum L1, tracked separately because it is a DIFFERENT token on a different chain. The
// navbar reads both chains, so one shared value would report the same MANA twice and show a wallet
// holding double what it has. Defaults to '0': the shop settles on Polygon, so that is where a test
// wallet's MANA lives unless a test is specifically about the L1 balance.
let ethereumManaBalanceWei = '0'
export function setEthereumManaBalanceWei(wei: string) {
  ethereumManaBalanceWei = wei
}

// Which chain a JSON-RPC request was addressed to, from the provider URL's path (`/amoy`, `/sepolia`).
// The app uses one read provider per chain, so the path is what separates a Polygon read from an L1 one.
function isEthereumRpc(rpcPath: string): boolean {
  return /sepolia|mainnet/.test(rpcPath)
}

// The MANA allowance the mocked ERC20 reports — set per test via launchApp({ manaAllowanceWei }). Max
// uint256 (the default) means already approved, so the MANA rails go straight to the purchase; '0' makes
// a self-custody wallet see the approval step first.
let manaAllowanceWei: string | null = null
export function setManaAllowanceWei(wei: string | null) {
  manaAllowanceWei = wei
}

// The buyer's CreditsManager meta-tx nonce. Bumped by the relayer mock on every accepted meta-tx.
let metaTxNonce = 0
export function bumpMetaTxNonce() {
  metaTxNonce += 1
}
export function resetMetaTxNonce() {
  metaTxNonce = 0
}
// How many meta-transactions the relayer accepted — one per basket group.
export function metaTxNonceValue() {
  return metaTxNonce
}

function ethCall(params: any[], rpcPath = ''): string {
  const data: string = params?.[0]?.data ?? '0x'
  const s = data.slice(0, 10)
  const now = Math.floor(Date.now() / 1000)
  switch (s) {
    case SELECTORS.contractSignatureIndex:
    case SELECTORS.signerSignatureIndex:
      return abi.encode(['uint256'], [0])
    case SELECTORS.getNonce:
      // Advances as the relayer accepts meta-transactions, because that is what the chain does — and a
      // multi-group basket waits for exactly this to move before signing its next group.
      return abi.encode(['uint256'], [metaTxNonce])
    case SELECTORS.balanceOf:
      // Per chain, so the navbar's two MANA reads are answered independently.
      return abi.encode(['uint256'], [isEthereumRpc(rpcPath) ? ethereumManaBalanceWei : manaBalanceWei])
    case SELECTORS.allowance:
      // Already approved (max uint256) by default → the MANA rails never need an approve in the happy
      // path, and any screen that READS an approval state sees it as granted. Must be mocked: an
      // unmocked selector returns '0x', which ethers cannot decode, so approval reads would fail
      // instead of reporting granted. Override per test via launchApp({ manaAllowanceWei }).
      return abi.encode(['uint256'], [manaAllowanceWei ?? ethers.constants.MaxUint256])
    case SELECTORS.globalMinters:
    case SELECTORS.isApprovedForAll:
      return abi.encode(['bool'], [true]) // already enabled → no tx needed
    case SELECTORS.manaUsdAggregator:
      return abi.encode(['address'], [MOCK_ORACLE])
    case SELECTORS.decimals:
      return abi.encode(['uint8'], [8])
    case SELECTORS.latestRoundData:
      return abi.encode(['uint80', 'int256', 'uint256', 'uint256', 'uint80'], [1, ORACLE_RATE, now, now, 1])
    default:
      return '0x'
  }
}

function one(req: { id: unknown; method: string; params?: any[] }, rpcPath = ''): unknown {
  const { id, method, params = [] } = req
  const result = (() => {
    switch (method) {
      case 'eth_chainId':
        return '0x13882'
      case 'net_version':
        return '80002'
      case 'eth_blockNumber':
        return '0x1'
      case 'eth_gasPrice':
        return '0x3b9aca00'
      case 'eth_estimateGas':
        return '0x5208'
      case 'eth_getBlockByNumber':
        return {
          number: '0x1',
          hash: '0x' + '00'.repeat(32),
          timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
          baseFeePerGas: '0x7',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          transactions: []
        }
      case 'eth_call':
        return ethCall(params, rpcPath)
      /**
       * An EOA, i.e. no contract code. decentraland-transactions' sendMetaTransaction asks this first
       * (`isContract(provider, account)`) and then calls `.toLowerCase()` on the answer, so leaving it
       * unmocked returned null and threw a TypeError — which every gasless path built on that library
       * (cancel a listing, grant an approval, transfer an item) surfaced as "the relayer failed". That is
       * why the cancel specs could only ever exercise the direct, gas-paying fallback.
       */
      case 'eth_getCode':
        return '0x'
      case 'eth_getTransactionReceipt':
        return {
          status: '0x1',
          transactionHash: params[0],
          blockNumber: '0x1',
          blockHash: '0x' + '00'.repeat(32),
          transactionIndex: '0x0',
          gasUsed: '0x5208',
          cumulativeGasUsed: '0x5208',
          contractAddress: null,
          logs: [],
          logsBloom: '0x' + '00'.repeat(256),
          type: '0x2',
          effectiveGasPrice: '0x1'
        }
      default:
        return null
    }
  })()
  return { jsonrpc: '2.0', id, result }
}

// Handle a JSON-RPC POST body (single or batch). Returns the response JSON string. `rpcPath` is the
// provider URL's path, which is what tells a Polygon read apart from an Ethereum L1 one.
export function handleRpc(body: string, rpcPath = ''): string {
  const parsed = JSON.parse(body)
  if (Array.isArray(parsed)) return JSON.stringify(parsed.map(req => one(req, rpcPath)))
  return JSON.stringify(one(parsed, rpcPath))
}
