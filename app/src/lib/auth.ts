import { ethers } from 'ethers'
import { ChainId, ProviderType } from '@dcl/schemas'
import { Authenticator, type AuthIdentity } from '@dcl/crypto'
import { localStorageGetIdentity, localStorageStoreIdentity } from '@dcl/single-sign-on-client'
import { config } from '~/config'

// ~31 days, same as the legacy marketplace webapp.
const IDENTITY_EXPIRATION_MINUTES = 31 * 24 * 60

// decentraland-connect drags in the whole wallet-modal stack (@reown/appkit, coinbase, magic, ...),
// which pulls @mui/@emotion. Load it on demand so none of that lands in the initial bundle — it's
// only needed to (re)connect, sign in, or sign out, all of which are already async.
async function getConnection() {
  return (await import('decentraland-connect')).connection
}

export type Session = {
  address: string
  chainId: number
  signer: ethers.providers.JsonRpcSigner
  web3Provider: ethers.providers.Web3Provider
  identity: AuthIdentity
  providerType: ProviderType
}

async function toSession(res: {
  account: string | null
  provider: unknown
  chainId: ChainId
  providerType: ProviderType
}): Promise<Session> {
  if (!res.account) throw new Error('No account returned by the wallet')
  const address = res.account.toLowerCase()
  const web3Provider = new ethers.providers.Web3Provider(res.provider as ethers.providers.ExternalProvider)
  const signer = web3Provider.getSigner()

  // Reuse a valid stored identity, otherwise create one (a single wallet signature).
  let identity = localStorageGetIdentity(address)
  if (!identity) {
    const ephemeral = ethers.Wallet.createRandom()
    identity = await Authenticator.initializeAuthChain(
      address,
      {
        address: ephemeral.address,
        publicKey: ethers.utils.hexlify(ephemeral.publicKey),
        privateKey: ethers.utils.hexlify(ephemeral.privateKey)
      },
      IDENTITY_EXPIRATION_MINUTES,
      message => signer.signMessage(message)
    )
    localStorageStoreIdentity(address, identity)
  }

  return { address, chainId: res.chainId, signer, web3Provider, identity, providerType: res.providerType }
}

export async function login(providerType: ProviderType = ProviderType.INJECTED): Promise<Session> {
  const connection = await getConnection()
  const res = await connection.connect(providerType, config.chainId)
  return toSession(res)
}

// Redirects to the auth app (method chooser). On return, restoreSession() rebuilds the session.
export function signInRedirect(): void {
  const redirectTo = encodeURIComponent(window.location.href)
  window.location.replace(`${config.authUrl}/login?redirectTo=${redirectTo}`)
}

export async function restoreSession(): Promise<Session | null> {
  try {
    const connection = await getConnection()
    const res = await connection.tryPreviousConnection()
    if (!res.account || !localStorageGetIdentity(res.account.toLowerCase())) return null
    return await toSession(res)
  } catch {
    return null
  }
}

// Best-effort account email from the connected provider — managed/social (Magic) sign-ins expose the
// user's email once a future decentraland-connect release ships `connection.getEmail()`. Optional-
// chained so this is simply `undefined` until then (the field stays empty/editable); never throws.
export async function getConnectionEmail(): Promise<string | undefined> {
  try {
    const connection = (await getConnection()) as { getEmail?: () => Promise<string | undefined> | string | undefined }
    const email = await connection.getEmail?.()
    return email ?? undefined
  } catch {
    return undefined
  }
}

export async function logout(): Promise<void> {
  try {
    const connection = await getConnection()
    await connection.disconnect()
  } catch {
    // ignore
  }
}
