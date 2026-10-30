type EthersModule = typeof import('ethers')

/**
 * A loader for `ethers` that shares one in-flight import between concurrent callers and forgets a failed
 * one, so a later call retries. Exported for its spec; the app uses `loadEthers`.
 */
export function createEthersLoader(importer: () => Promise<EthersModule> = () => import('ethers')) {
  let loading: Promise<EthersModule> | undefined
  return async function load(): Promise<EthersModule['ethers']> {
    loading ??= importer().catch((error: unknown) => {
      // A chunk that fails once (a blip, or a hash invalidated by a deploy) must not break every later
      // balance read and sign-in until the page is reloaded.
      loading = undefined
      throw error
    })
    return (await loading).ethers
  }
}

/** `ethers`, loaded on first use rather than in the entry chunk — every runtime use is already async. */
export const loadEthers = createEthersLoader()
