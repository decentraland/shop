import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Squid } from '@0xsquid/sdk'
import { AxelarProvider } from 'decentraland-transactions/crossChain'
import { ContractName, getContract } from 'decentraland-transactions'

/**
 * The route check copies the hook `getRegisterNameRoute` builds, call for call. This runs the REAL library,
 * its quote loop included, with only the SDK's HTTP calls and the RPC reads stubbed, so a release that changes
 * that hook fails here instead of silently dropping the Polygon MANA rail for every buyer.
 */
vi.mock('~/config', () => ({
  config: {
    creditsServerUrl: 'https://credits.example',
    chainId: 137,
    ethereumChainId: 1,
    rpcUrl: 'https://rpc.example/polygon',
    squidApiUrl: 'https://squid.example'
  }
}))

vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  const big = (value: string) => ({ toString: () => value })
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      providers: {
        ...actual.ethers.providers,
        JsonRpcProvider: vi.fn(() => ({
          getBalance: async () => big((10n ** 18n).toString()),
          getGasPrice: async () => big('50000000000')
        }))
      },
      Contract: vi.fn(() => ({ allowance: async () => big('0') }))
    }
  }
})

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

import { SQUID_ROUTER, quoteNameWithPolygonMana } from '~/lib/names'

type Internals = {
  init: () => Promise<void>
  getSupportedTokens: () => unknown[]
  getFromAmount: () => Promise<string>
}

const BUYER = '0x00000000000000000000000000000000000b0b01'
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

describe('when the route is the one decentraland-transactions builds for a NAME', () => {
  const prototype = AxelarProvider.prototype as unknown as Internals
  let original: Internals
  let originalSdk: Pick<Squid, 'init' | 'getRoute'>

  beforeEach(() => {
    original = {
      init: prototype.init,
      getSupportedTokens: prototype.getSupportedTokens,
      getFromAmount: prototype.getFromAmount
    }
    originalSdk = { init: Squid.prototype.init, getRoute: Squid.prototype.getRoute }
    // The provider's constructor starts the SDK's own init, unawaited.
    Squid.prototype.init = async () => undefined
    const token = (chainId: string, address: string) => ({ chainId, address, decimals: 18, symbol: 'MANA' })
    prototype.init = async () => undefined
    prototype.getSupportedTokens = () => [
      token('137', getContract(ContractName.MANAToken, 137).address.toLowerCase()),
      token('1', getContract(ContractName.MANAToken, 1).address.toLowerCase()),
      { ...token('137', NATIVE), symbol: 'POL', usdPrice: 0.25 }
    ]
    prototype.getFromAmount = async () => '101.5'
    // The API echoes the request as `params`, and delivers enough for the library's loop to stop at once.
    Squid.prototype.getRoute = (async (request: Record<string, unknown>) => ({
      requestId: 'req-1',
      route: {
        params: request,
        estimate: { gasCosts: [], feeCosts: [], toAmountMin: '100500000000000000000' },
        transactionRequest: { target: SQUID_ROUTER, value: '0', gasLimit: '500000', maxFeePerGas: '100000000000' }
      }
    })) as unknown as Squid['getRoute']
  })

  afterEach(() => {
    Object.assign(prototype, original)
    Object.assign(Squid.prototype, originalSdk)
    captureError.mockReset()
  })

  it('should accept it', async () => {
    await expect(quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).resolves.toMatchObject({
      manaWei: 101_500_000_000_000_000_000n
    })
  })

  it('should report nothing', async () => {
    await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

    expect(captureError).not.toHaveBeenCalled()
  })
})
