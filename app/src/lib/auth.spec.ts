import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProviderType } from '@dcl/schemas'

// ---- I/O boundaries stubbed inline. auth.ts touches: decentraland-connect (dynamic import),
// @dcl/crypto, @dcl/single-sign-on-client, ethers and window.location. Keep them all off the wire.
//
// vi.mock factories are hoisted above the module body, so every spy they close over must be created
// with vi.hoisted() to exist by the time the factories run.
const {
  connect,
  tryPreviousConnection,
  disconnect,
  localStorageGetIdentity,
  localStorageStoreIdentity,
  initializeAuthChain,
  signMessage,
  Web3Provider
} = vi.hoisted(() => {
  const signMessage = vi.fn(async () => '0xsignature')
  return {
    connect: vi.fn(),
    tryPreviousConnection: vi.fn(),
    disconnect: vi.fn(),
    localStorageGetIdentity: vi.fn(),
    localStorageStoreIdentity: vi.fn(),
    initializeAuthChain: vi.fn(),
    signMessage,
    Web3Provider: vi.fn(() => ({ getSigner: () => ({ signMessage }) }))
  }
})

// decentraland-connect is loaded via `await import(...)`; expose a `connection` singleton whose
// methods are spies so we can assert what login/restoreSession/logout drive.
vi.mock('decentraland-connect', () => ({
  connection: { connect, tryPreviousConnection, disconnect }
}))

// Stored-identity cache: control whether a previous identity exists and capture writes.
vi.mock('@dcl/single-sign-on-client', () => ({
  localStorageGetIdentity,
  localStorageStoreIdentity
}))

// initializeAuthChain performs the wallet signature dance; stub it to a sentinel identity.
vi.mock('@dcl/crypto', () => ({
  Authenticator: { initializeAuthChain }
}))

vi.mock('~/config', () => ({ config: { chainId: 80002, authUrl: 'https://auth.example' } }))

// Keep ethers utils real (hexlify etc.), but swap Web3Provider so no real provider is built, and
// Wallet.createRandom so identity creation doesn't burn entropy / hit crypto.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ethers: {
      ...actual.ethers,
      providers: { ...actual.ethers.providers, Web3Provider },
      Wallet: {
        ...actual.ethers.Wallet,
        createRandom: () => ({
          address: '0x00000000000000000000000000000000000000ee',
          publicKey: '0xabcdef',
          privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        })
      }
    }
  }
})

// eslint-disable-next-line import/first
import { login, restoreSession, logout, signInRedirect } from '~/lib/auth'

const STORED_IDENTITY = { authChain: [{ type: 'SIGNER' }] }

beforeEach(() => {
  vi.clearAllMocks()
  connect.mockReset()
  tryPreviousConnection.mockReset()
  disconnect.mockReset()
  localStorageGetIdentity.mockReset()
  localStorageStoreIdentity.mockReset()
  initializeAuthChain.mockReset()
  Web3Provider.mockClear()
  signMessage.mockClear()
})

describe('when logging in', () => {
  it('should connect with the configured chain id and default injected provider', async () => {
    connect.mockResolvedValue({
      account: '0xABCDEF0000000000000000000000000000000001',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(STORED_IDENTITY)

    await login()

    expect(connect).toHaveBeenCalledWith(ProviderType.INJECTED, 80002)
  })

  it('should forward an explicit provider type to the connection', async () => {
    connect.mockResolvedValue({
      account: '0xABCDEF0000000000000000000000000000000001',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.MAGIC
    })
    localStorageGetIdentity.mockReturnValue(STORED_IDENTITY)

    await login(ProviderType.MAGIC)

    expect(connect).toHaveBeenCalledWith(ProviderType.MAGIC, 80002)
  })

  it('should lowercase the returned account and reuse a stored identity without signing', async () => {
    connect.mockResolvedValue({
      account: '0xABCDEF0000000000000000000000000000000001',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(STORED_IDENTITY)

    const session = await login()

    expect(session.address).toBe('0xabcdef0000000000000000000000000000000001')
    expect(session.chainId).toBe(80002)
    expect(session.providerType).toBe(ProviderType.INJECTED)
    expect(session.identity).toBe(STORED_IDENTITY)
    expect(localStorageGetIdentity).toHaveBeenCalledWith('0xabcdef0000000000000000000000000000000001')
    // Reused identity → no fresh auth chain, no store write.
    expect(initializeAuthChain).not.toHaveBeenCalled()
    expect(localStorageStoreIdentity).not.toHaveBeenCalled()
  })

  it('should create and persist a new identity when none is stored', async () => {
    const fresh = { authChain: [{ type: 'NEW' }] }
    connect.mockResolvedValue({
      account: '0xAbC0000000000000000000000000000000000002',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(null)
    initializeAuthChain.mockResolvedValue(fresh)

    const session = await login()

    expect(session.identity).toBe(fresh)
    // The ephemeral identity is derived from the created random wallet, expiring in ~31 days.
    expect(initializeAuthChain).toHaveBeenCalledWith(
      '0xabc0000000000000000000000000000000000002',
      {
        address: '0x00000000000000000000000000000000000000ee',
        publicKey: '0xabcdef',
        privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      },
      31 * 24 * 60,
      expect.any(Function)
    )
    expect(localStorageStoreIdentity).toHaveBeenCalledWith('0xabc0000000000000000000000000000000000002', fresh)
  })

  it('should sign auth-chain messages through the wallet signer', async () => {
    connect.mockResolvedValue({
      account: '0xAbC0000000000000000000000000000000000002',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(null)
    initializeAuthChain.mockResolvedValue({ authChain: [] })

    await login()

    // The 4th arg is the signer callback wired to the Web3Provider's signer.
    const signer = initializeAuthChain.mock.calls[0][3] as (m: string) => Promise<string>
    await expect(signer('hello')).resolves.toBe('0xsignature')
    expect(signMessage).toHaveBeenCalledWith('hello')
  })

  it('should reject when the wallet returns no account', async () => {
    connect.mockResolvedValue({
      account: null,
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })

    await expect(login()).rejects.toThrow(/no account/i)
    expect(initializeAuthChain).not.toHaveBeenCalled()
  })

  it('should propagate a connection failure', async () => {
    connect.mockRejectedValue(new Error('user rejected'))

    await expect(login()).rejects.toThrow('user rejected')
  })
})

describe('when restoring a previous session', () => {
  it('should rebuild the session from a prior connection with a stored identity', async () => {
    tryPreviousConnection.mockResolvedValue({
      account: '0xDEAD0000000000000000000000000000000000AA',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(STORED_IDENTITY)

    const session = await restoreSession()

    expect(session).not.toBeNull()
    expect(session!.address).toBe('0xdead0000000000000000000000000000000000aa')
    expect(session!.identity).toBe(STORED_IDENTITY)
    // A restore must never trigger a fresh signature.
    expect(initializeAuthChain).not.toHaveBeenCalled()
  })

  it('should return null when there is no previous account', async () => {
    tryPreviousConnection.mockResolvedValue({
      account: null,
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })

    await expect(restoreSession()).resolves.toBeNull()
  })

  it('should return null when there is no stored identity for the account', async () => {
    tryPreviousConnection.mockResolvedValue({
      account: '0xDEAD0000000000000000000000000000000000AA',
      provider: {},
      chainId: 80002,
      providerType: ProviderType.INJECTED
    })
    localStorageGetIdentity.mockReturnValue(null)

    const session = await restoreSession()

    expect(session).toBeNull()
    // Guard checks the lowercased address before ever building a session.
    expect(localStorageGetIdentity).toHaveBeenCalledWith('0xdead0000000000000000000000000000000000aa')
    expect(Web3Provider).not.toHaveBeenCalled()
  })

  it('should swallow errors from the connection and return null', async () => {
    tryPreviousConnection.mockRejectedValue(new Error('no provider'))

    await expect(restoreSession()).resolves.toBeNull()
  })
})

describe('when logging out', () => {
  it('should disconnect the wallet connection', async () => {
    disconnect.mockResolvedValue(undefined)

    await logout()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('should not throw when disconnect fails', async () => {
    disconnect.mockRejectedValue(new Error('already gone'))

    await expect(logout()).resolves.toBeUndefined()
  })
})

describe('when redirecting to the auth app', () => {
  const original = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://shop.example/get?x=1', replace: vi.fn() }
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })

  it('should replace the location with the auth login url carrying an encoded return url', () => {
    signInRedirect()

    expect(window.location.replace).toHaveBeenCalledWith(
      `https://auth.example/login?redirectTo=${encodeURIComponent('https://shop.example/get?x=1')}`
    )
  })
})
