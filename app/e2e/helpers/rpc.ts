import { ethers } from 'ethers'

// Minimal JSON-RPC responder for the app's read provider (config.rpcUrl). Returns canned, ABI-encoded
// results so contract reads resolve WITHOUT a real chain: "already approved / already a minter" (so
// no on-chain tx is ever needed in the happy paths) + the MANA/USD oracle rate.

const MOCK_ORACLE = '0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e'
const ORACLE_RATE = 26960836 // ~$0.2696 at 8 decimals (the Amoy mock aggregator)
const abi = ethers.utils.defaultAbiCoder
const sel = (sig: string) => ethers.utils.id(sig).slice(0, 10)

const SELECTORS = {
  contractSignatureIndex: sel('contractSignatureIndex()'),
  signerSignatureIndex: sel('signerSignatureIndex(address)'),
  globalMinters: sel('globalMinters(address)'),
  isApprovedForAll: sel('isApprovedForAll(address,address)'),
  manaUsdAggregator: sel('manaUsdAggregator()'),
  decimals: sel('decimals()'),
  latestRoundData: sel('latestRoundData()'),
  getNonce: sel('getNonce(address)') // CreditsManager meta-tx nonce (gasless checkout)
}

function ethCall(params: any[]): string {
  const data: string = params?.[0]?.data ?? '0x'
  const s = data.slice(0, 10)
  const now = Math.floor(Date.now() / 1000)
  switch (s) {
    case SELECTORS.contractSignatureIndex:
    case SELECTORS.signerSignatureIndex:
    case SELECTORS.getNonce:
      return abi.encode(['uint256'], [0])
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

function one(req: { id: unknown; method: string; params?: any[] }): unknown {
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
        return ethCall(params)
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

// Handle a JSON-RPC POST body (single or batch). Returns the response JSON string.
export function handleRpc(body: string): string {
  const parsed = JSON.parse(body)
  if (Array.isArray(parsed)) return JSON.stringify(parsed.map(one))
  return JSON.stringify(one(parsed))
}
