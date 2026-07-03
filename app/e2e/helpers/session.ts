import { ethers } from 'ethers'
import { Authenticator } from '@dcl/crypto'

// A deterministic, obviously-fake throwaway key for the e2e test user. NEVER a real account.
const USER_PK = '0x' + '11'.repeat(32)
const CHAIN_ID = 80002
const CHAIN_HEX = '0x' + CHAIN_ID.toString(16)
// Canned 65-byte signature the mock wallet returns for any signTypedData/personal_sign. The mocked
// servers never verify it, so a fixed value is fine (and keeps runs deterministic).
const CANNED_SIG = '0x' + 'ab'.repeat(65)

export type TestSession = { address: string; identityJson: string }

// Build a real, well-formed AuthIdentity for the test user (so decentraland-crypto-fetch can sign
// requests with the ephemeral key). Runs in node — no wallet, no popup.
export async function buildTestSession(): Promise<TestSession> {
  const user = new ethers.Wallet(USER_PK)
  const address = user.address.toLowerCase()
  const ephemeral = ethers.Wallet.createRandom()
  const identity = await Authenticator.initializeAuthChain(
    user.address,
    {
      address: ephemeral.address,
      publicKey: ethers.utils.hexlify(ephemeral.publicKey),
      privateKey: ethers.utils.hexlify(ephemeral.privateKey)
    },
    31 * 24 * 60, // minutes (same as the app)
    message => user.signMessage(message)
  )
  return { address, identityJson: JSON.stringify(identity) }
}

/**
 * Browser init script (runs before the app loads on every navigation): seeds the two localStorage
 * keys the app reads on restore (decentraland-connect last connection + the SSO identity) and
 * installs a mock EIP-1193 `window.ethereum`. Result: `restoreSession()` yields a full session with
 * no login UI and no real signing — the exact production code path, just a fake provider underneath.
 */
export function sessionInitScript(session: TestSession): string {
  return `(() => {
    localStorage.setItem('decentraland-connect-storage-key', ${JSON.stringify(
      JSON.stringify({ providerType: 'injected', chainId: CHAIN_ID })
    )});
    localStorage.setItem('single-sign-on-${session.address}', ${JSON.stringify(session.identityJson)});

    const ADDR = '${session.address}';
    const SIG = '${CANNED_SIG}';
    const CHAIN = '${CHAIN_HEX}';
    const FAKE_TX = '0x' + 'cd'.repeat(32);
    const handle = async (method, params) => {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [ADDR];
        case 'eth_chainId': return CHAIN;
        case 'net_version': return String(parseInt(CHAIN, 16));
        case 'eth_signTypedData_v4':
        case 'eth_signTypedData':
        case 'personal_sign':
        case 'eth_sign': return SIG;
        case 'eth_sendTransaction': return FAKE_TX;
        case 'eth_getTransactionByHash':
          return { hash: (params && params[0]) || FAKE_TX, from: ADDR, to: null, blockNumber: '0x1', blockHash: '0x' + '00'.repeat(32), transactionIndex: '0x0', nonce: '0x0', value: '0x0', gas: '0x5208', gasPrice: '0x1', input: '0x' };
        case 'eth_getTransactionReceipt':
          return { status: '0x1', transactionHash: (params && params[0]) || FAKE_TX, blockNumber: '0x1', blockHash: '0x' + '00'.repeat(32), transactionIndex: '0x0', from: ADDR, to: null, gasUsed: '0x5208', cumulativeGasUsed: '0x5208', contractAddress: null, logs: [], logsBloom: '0x' + '00'.repeat(256), type: '0x2', effectiveGasPrice: '0x1' };
        case 'eth_blockNumber': return '0x1';
        case 'eth_call': return '0x';
        case 'eth_estimateGas': return '0x5208';
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': return null;
        default: return null;
      }
    };
    const eth = {
      isMetaMask: true,
      chainId: CHAIN,
      request: ({ method, params }) => handle(method, params),
      enable: () => handle('eth_requestAccounts'),
      on: () => {}, removeListener: () => {}, removeAllListeners: () => {}
    };
    eth.send = (m, p) => (typeof m === 'string' ? handle(m, p) : handle(m.method, m.params));
    eth.sendAsync = (payload, cb) =>
      handle(payload.method, payload.params)
        .then(result => cb(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch(err => cb(err));
    window.ethereum = eth;
  })()`
}
