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
const sendMetaTransactionMock = vi.fn()
const waitForTransactionMock = vi.fn()

vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplaceV2: 'OffChainMarketplaceV2',
    MANAToken: 'MANAToken',
    CreditsManager: 'CreditsManager',
    ERC721CollectionV2: 'ERC721CollectionV2'
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
  }),
  sendMetaTransaction: (...args: unknown[]) => sendMetaTransactionMock(...args),
  MetaTransactionError: class MetaTransactionError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message)
    }
  },
  ErrorCode: { USER_DENIED: 'user_denied' }
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost:9999' } }))
vi.mock('~/lib/gasless-config', () => ({
  gaslessConfig: { enabled: true, relayerUrl: 'http://relayer.test/v1' },
  gaslessEnabled: () => true
}))

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
    waitForTransaction(...args: unknown[]) {
      return waitForTransactionMock(...args)
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
import { MetaTransactionError, ErrorCode } from 'decentraland-transactions'
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

// Interfaces to decode the calldata the meta-tx wraps (ethers.utils is the real module here).
const erc20Iface = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
const erc721Iface = new ethers.utils.Interface(['function setApprovalForAll(address operator, bool approved)'])
const minterIface = new ethers.utils.Interface(['function setMinters(address[] minters, bool[] values)'])

describe('when setting an authorization (gasless meta-tx — the path for every wallet)', () => {
  beforeEach(() => {
    sendMetaTransactionMock.mockResolvedValue('0xhash')
    waitForTransactionMock.mockResolvedValue({ status: 1 })
  })

  it('should relay an ALLOWANCE grant as approve(MAX) against MANA, never a direct tx', async () => {
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner(), active: true })
    expect(approveMock).not.toHaveBeenCalled()
    expect(sendMetaTransactionMock).toHaveBeenCalledOnce()
    const [, , functionData, contractData, config] = sendMetaTransactionMock.mock.calls[0]
    expect(contractData.address).toBe(MANA)
    const [spender, amount] = erc20Iface.decodeFunctionData('approve', functionData as string)
    expect(spender.toLowerCase()).toBe(CREDITS_MANAGER)
    expect(amount).toEqual(ethers.constants.MaxUint256)
    expect(config).toEqual({ serverURL: 'http://relayer.test/v1' })
    expect(waitForTransactionMock).toHaveBeenCalledWith('0xhash', 1, 120_000)
  })

  it('should relay an ALLOWANCE revoke as approve(0)', async () => {
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner(), active: false })
    const [, , functionData] = sendMetaTransactionMock.mock.calls[0]
    const [, amount] = erc20Iface.decodeFunctionData('approve', functionData as string)
    expect(amount).toEqual(ethers.constants.Zero)
  })

  it('should relay an APPROVAL as setApprovalForAll against the collection', async () => {
    await setAuthorization({ auth: approvalAuth, signer: makeSigner(), active: true })
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
    const [, , functionData, contractData] = sendMetaTransactionMock.mock.calls[0]
    expect(contractData.address).toBe(COLLECTION)
    const [operator, approved] = erc721Iface.decodeFunctionData('setApprovalForAll', functionData as string)
    expect(operator.toLowerCase()).toBe(MARKET)
    expect(approved).toBe(true)
  })

  it('should relay a MINTER grant as setMinters against the collection', async () => {
    await setAuthorization({ auth: minterAuth, signer: makeSigner(), active: true })
    expect(setMintersMock).not.toHaveBeenCalled()
    const [, , functionData, contractData] = sendMetaTransactionMock.mock.calls[0]
    expect(contractData.address).toBe(COLLECTION)
    const [minters, values] = minterIface.decodeFunctionData('setMinters', functionData as string)
    expect(minters[0].toLowerCase()).toBe(MARKET)
    expect(values[0]).toBe(true)
  })
})

describe('when the gasless relayer is unavailable (fallback to a direct tx)', () => {
  it('should fall back to a direct approve when the relayer errors', async () => {
    sendMetaTransactionMock.mockRejectedValue(new Error('relayer 502'))
    approveMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: allowanceAuth, signer: makeSigner(), active: true })
    expect(approveMock).toHaveBeenCalledWith(CREDITS_MANAGER, ethers.constants.MaxUint256)
  })

  it('should fall back to a direct setApprovalForAll when the relayer errors', async () => {
    sendMetaTransactionMock.mockRejectedValue(new Error('relayer down'))
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: approvalAuth, signer: makeSigner(), active: true })
    expect(setApprovalForAllMock).toHaveBeenCalledWith(MARKET, true)
  })

  it('should fall back to a direct setMinters when the relayer errors', async () => {
    sendMetaTransactionMock.mockRejectedValue(new Error('relayer down'))
    setMintersMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    await setAuthorization({ auth: minterAuth, signer: makeSigner(), active: true })
    expect(setMintersMock).toHaveBeenCalledWith([MARKET], [true])
  })

  it('should switch the wallet chain before the fallback tx when on the wrong network', async () => {
    sendMetaTransactionMock.mockRejectedValue(new Error('relayer down'))
    approveMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    const send = vi.fn().mockResolvedValue(undefined)
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    await setAuthorization({
      auth: allowanceAuth,
      signer: makeSigner({ provider: { getNetwork, send } }),
      active: true
    })
    expect(send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x13882' }])
  })

  it('should NOT fall back and should rethrow when the user rejects the signature', async () => {
    sendMetaTransactionMock.mockRejectedValue(
      new MetaTransactionError('User denied message signature', ErrorCode.USER_DENIED)
    )
    await expect(setAuthorization({ auth: approvalAuth, signer: makeSigner(), active: true })).rejects.toThrow(
      /denied/i
    )
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
  })
})

describe('when ensuring an authorization before an action', () => {
  beforeEach(() => {
    sendMetaTransactionMock.mockResolvedValue('0xhash')
    waitForTransactionMock.mockResolvedValue({ status: 1 })
  })

  it('should skip granting when it is already in place (fetch-then-grant guard)', async () => {
    isApprovedForAllMock.mockResolvedValue(true)
    await ensureAuthorization({ auth: approvalAuth, signer: makeSigner() })
    // Already authorized → neither a meta-tx nor a direct tx is sent.
    expect(sendMetaTransactionMock).not.toHaveBeenCalled()
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
  })

  it('should grant (gaslessly) when missing', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    await ensureAuthorization({ auth: approvalAuth, signer: makeSigner() })
    expect(sendMetaTransactionMock).toHaveBeenCalledOnce()
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
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
