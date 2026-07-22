import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChainId, ProviderType } from '@dcl/schemas'

// Track calls into the mocked ethers Contract so we can assert on the on-chain paths without a chain.
const allowanceMock = vi.fn()
const approveMock = vi.fn()
const isApprovedForAllMock = vi.fn()
const setApprovalForAllMock = vi.fn()
const globalMintersMock = vi.fn()
const setMintersMock = vi.fn()
const jsonRpcProviderCtor = vi.fn()

vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplaceV2: 'OffChainMarketplaceV2',
    MANAToken: 'MANAToken',
    CreditsManager: 'CreditsManager'
  },
  getContract: (name: string) => ({
    address:
      name === 'MANAToken'
        ? '0x0000000000000000000000000000000000000123'
        : name === 'CreditsManager'
          ? '0x0000000000000000000000000000000000000999'
          : '0x0000000000000000000000000000000000000000',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    abi: []
  })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost:9999' } }))

// Keep real ethers utils/BigNumber/constants; swap Contract + JsonRpcProvider so nothing hits a chain.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()

  class MockContract {
    address: string
    constructor(address: string, _abi: unknown, _providerOrSigner: unknown) {
      this.address = address
    }
    allowance(...args: unknown[]) {
      return allowanceMock(...args)
    }
    approve(...args: unknown[]) {
      return approveMock(...args)
    }
    isApprovedForAll(...args: unknown[]) {
      return isApprovedForAllMock(...args)
    }
    setApprovalForAll(...args: unknown[]) {
      return setApprovalForAllMock(...args)
    }
    globalMinters(...args: unknown[]) {
      return globalMintersMock(...args)
    }
    setMinters(...args: unknown[]) {
      return setMintersMock(...args)
    }
  }

  class MockJsonRpcProvider {
    constructor(url: string) {
      jsonRpcProviderCtor(url)
    }
  }

  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: {
        ...actual.ethers.providers,
        JsonRpcProvider: MockJsonRpcProvider
      }
    }
  }
})

import { ethers } from 'ethers'
import {
  AuthorizationKind,
  ensureAuthorization,
  ensureChain,
  getAuthorizationStatus,
  getCollectionSellingAuthorization,
  getCreditsAuthorization,
  needsApprovalStep,
  setAuthorization,
  type ShopAuthorization
} from '~/lib/authorizations'

const MARKET = '0x0000000000000000000000000000000000000000'
const MANA = '0x0000000000000000000000000000000000000123'
const CREDITS_MANAGER = '0x0000000000000000000000000000000000000999'
const OWNER = '0x00000000000000000000000000000000000000AA'
const COLLECTION = '0x00000000000000000000000000000000000000CC'

const allowanceAuth: ShopAuthorization = {
  kind: AuthorizationKind.Allowance,
  contractAddress: MANA,
  spenderAddress: CREDITS_MANAGER,
  chainId: ChainId.MATIC_AMOY
}
const approvalAuth: ShopAuthorization = {
  kind: AuthorizationKind.Approval,
  contractAddress: COLLECTION,
  spenderAddress: MARKET,
  chainId: ChainId.MATIC_AMOY
}
const minterAuth: ShopAuthorization = {
  kind: AuthorizationKind.Minter,
  contractAddress: COLLECTION,
  spenderAddress: MARKET,
  chainId: ChainId.MATIC_AMOY
}

function makeSigner(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue(undefined)
  const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.MATIC_AMOY })
  return {
    getAddress: vi.fn().mockResolvedValue(OWNER),
    provider: { getNetwork, send },
    ...overrides
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('when reading an authorization status', () => {
  it('and it is an allowance it should be active when the allowance is greater than zero', async () => {
    allowanceMock.mockResolvedValue(ethers.BigNumber.from('5'))
    expect(await getAuthorizationStatus(allowanceAuth, OWNER)).toBe(true)
    expect(allowanceMock).toHaveBeenCalledWith(OWNER, CREDITS_MANAGER)
  })

  it('and it is an allowance it should be inactive when the allowance is zero', async () => {
    allowanceMock.mockResolvedValue(ethers.BigNumber.from('0'))
    expect(await getAuthorizationStatus(allowanceAuth, OWNER)).toBe(false)
  })

  it('and it is an approval it should reflect isApprovedForAll', async () => {
    isApprovedForAllMock.mockResolvedValue(true)
    expect(await getAuthorizationStatus(approvalAuth, OWNER)).toBe(true)
    expect(isApprovedForAllMock).toHaveBeenCalledWith(OWNER, MARKET)
  })

  it('and it is a minter it should reflect globalMinters', async () => {
    globalMintersMock.mockResolvedValue(true)
    expect(await getAuthorizationStatus(minterAuth, OWNER)).toBe(true)
    expect(globalMintersMock).toHaveBeenCalledWith(MARKET)
  })

  it('and the minter read reverts it should be inactive', async () => {
    globalMintersMock.mockRejectedValue(new Error('revert'))
    expect(await getAuthorizationStatus(minterAuth, OWNER)).toBe(false)
  })

  it('should read through the target-chain RPC provider', async () => {
    allowanceMock.mockResolvedValue(ethers.BigNumber.from('1'))
    await getAuthorizationStatus(allowanceAuth, OWNER)
    expect(jsonRpcProviderCtor).toHaveBeenCalledWith('http://localhost:9999')
  })
})

describe('when setting an authorization', () => {
  it('and granting an allowance it should approve the unlimited amount and wait', async () => {
    const wait = vi.fn().mockResolvedValue(undefined)
    approveMock.mockResolvedValue({ wait })
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner(), active: true })
    expect(approveMock).toHaveBeenCalledWith(CREDITS_MANAGER, ethers.constants.MaxUint256)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('and revoking an allowance it should approve zero', async () => {
    approveMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner(), active: false })
    expect(approveMock).toHaveBeenCalledWith(CREDITS_MANAGER, ethers.constants.Zero)
  })

  it('and granting an approval it should setApprovalForAll true', async () => {
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: approvalAuth, signer: makeSigner(), active: true })
    expect(setApprovalForAllMock).toHaveBeenCalledWith(MARKET, true)
  })

  it('and revoking an approval it should setApprovalForAll false', async () => {
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: approvalAuth, signer: makeSigner(), active: false })
    expect(setApprovalForAllMock).toHaveBeenCalledWith(MARKET, false)
  })

  it('and granting a minter it should setMinters true', async () => {
    setMintersMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: minterAuth, signer: makeSigner(), active: true })
    expect(setMintersMock).toHaveBeenCalledWith([MARKET], [true])
  })

  it('should switch the wallet chain before sending when on the wrong network', async () => {
    approveMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    const send = vi.fn().mockResolvedValue(undefined)
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner({ provider: { getNetwork, send } }), active: true })
    expect(send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x13882' }])
  })
})

describe('when ensuring an authorization before an action', () => {
  it('should skip sending a tx when it is already in place', async () => {
    isApprovedForAllMock.mockResolvedValue(true)
    const signer = makeSigner()
    await ensureAuthorization({ auth: approvalAuth, signer })
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
    expect((signer as unknown as { provider: { send: ReturnType<typeof vi.fn> } }).provider.send).not.toHaveBeenCalled()
  })

  it('should grant when missing', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await ensureAuthorization({ auth: approvalAuth, signer: makeSigner() })
    expect(setApprovalForAllMock).toHaveBeenCalledWith(MARKET, true)
  })
})

describe('when deciding whether to surface a first-time approval step', () => {
  it('should surface it for a self-custody wallet with a missing authorization', () => {
    expect(needsApprovalStep(ProviderType.INJECTED, false)).toBe(true)
  })

  it('should not surface it for a self-custody wallet that is already authorized', () => {
    expect(needsApprovalStep(ProviderType.INJECTED, true)).toBe(false)
  })

  it('should never surface it for a managed (Magic) wallet', () => {
    expect(needsApprovalStep(ProviderType.MAGIC, false)).toBe(false)
  })

  it('should never surface it for a managed (thirdweb) wallet', () => {
    expect(needsApprovalStep('thirdweb' as ProviderType, false)).toBe(false)
  })

  it('should not surface it when there is no provider', () => {
    expect(needsApprovalStep(null, false)).toBe(false)
  })
})

describe('when building the shop authorization descriptors', () => {
  it('should point the credits authorization at the CreditsManager as a MANA allowance', () => {
    const auth = getCreditsAuthorization(ChainId.MATIC_AMOY)
    expect(auth.kind).toBe(AuthorizationKind.Allowance)
    expect(auth.contractAddress).toBe(MANA)
    expect(auth.spenderAddress).toBe(CREDITS_MANAGER)
    expect(auth.group).toBe('buying')
    expect(auth.id).toBe('credits')
  })

  it('should point a selling authorization at the marketplace as an approval', () => {
    const auth = getCollectionSellingAuthorization(COLLECTION, ChainId.MATIC_AMOY)
    expect(auth.kind).toBe(AuthorizationKind.Approval)
    expect(auth.contractAddress).toBe(COLLECTION)
    expect(auth.spenderAddress).toBe(MARKET)
    expect(auth.group).toBe('selling')
    expect(auth.id).toBe(`selling:${COLLECTION.toLowerCase()}`)
  })
})

describe('when ensuring the wallet is on the right chain', () => {
  it('should no-op when already on the target chain', async () => {
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.MATIC_AMOY })
    const send = vi.fn()
    await ensureChain({ getNetwork, send } as never, ChainId.MATIC_AMOY)
    expect(send).not.toHaveBeenCalled()
  })

  it('should add the Amoy chain when switching fails with 4902', async () => {
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const send = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValueOnce(undefined)
    await ensureChain({ getNetwork, send } as never, ChainId.MATIC_AMOY)
    expect(send).toHaveBeenNthCalledWith(2, 'wallet_addEthereumChain', expect.any(Array))
  })

  it('should rethrow a non-4902 switch error', async () => {
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const send = vi.fn().mockRejectedValue({ code: 4001 })
    await expect(ensureChain({ getNetwork, send } as never, ChainId.MATIC_AMOY)).rejects.toMatchObject({ code: 4001 })
  })
})
