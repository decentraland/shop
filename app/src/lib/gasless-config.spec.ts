import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// gasless-config reads import.meta.env at module-load time (the `flag` const and the
// gaslessConfig object are evaluated on import). So each permutation is exercised by stubbing
// the env, resetting the module registry, and dynamically re-importing a fresh copy.
type GaslessModule = typeof import('~/lib/gasless-config')

async function loadFresh(env: Record<string, string | undefined>): Promise<GaslessModule> {
  vi.resetModules()
  // Stubbing with `undefined` removes the key entirely, so an omitted var reads as unset
  // (nullish) rather than an empty string — that distinction drives the `?? default` fallback.
  vi.stubEnv('VITE_GASLESS_CHECKOUT', env.VITE_GASLESS_CHECKOUT as string)
  vi.stubEnv('VITE_RELAYER_URL', env.VITE_RELAYER_URL as string)
  return import('~/lib/gasless-config')
}

const DEFAULT_RELAYER = 'https://transactions-api.decentraland.zone/v1'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('when VITE_GASLESS_CHECKOUT toggles the feature flag', () => {
  it('should enable gasless for the literal "1"', async () => {
    const mod = await loadFresh({ VITE_GASLESS_CHECKOUT: '1' })
    expect(mod.gaslessConfig.enabled).toBe(true)
    expect(mod.gaslessEnabled()).toBe(true)
  })

  it('should enable gasless for "true" regardless of case', async () => {
    for (const value of ['true', 'TRUE', 'True', 'tRuE']) {
      const mod = await loadFresh({ VITE_GASLESS_CHECKOUT: value })
      expect(mod.gaslessConfig.enabled).toBe(true)
      expect(mod.gaslessEnabled()).toBe(true)
    }
  })

  it('should stay disabled when the flag is unset (empty string)', async () => {
    const mod = await loadFresh({})
    expect(mod.gaslessConfig.enabled).toBe(false)
    expect(mod.gaslessEnabled()).toBe(false)
  })

  it('and the flag is any other truthy-looking string it should still be disabled', async () => {
    for (const value of ['0', 'false', 'yes', 'on', 'enabled', '2', ' 1', '1 ']) {
      const mod = await loadFresh({ VITE_GASLESS_CHECKOUT: value })
      expect(mod.gaslessConfig.enabled).toBe(false)
      expect(mod.gaslessEnabled()).toBe(false)
    }
  })
})

describe('when resolving the relayer URL', () => {
  it('should fall back to the shared DCL dev relayer when VITE_RELAYER_URL is unset', async () => {
    const mod = await loadFresh({ VITE_GASLESS_CHECKOUT: '1' })
    expect(mod.gaslessConfig.relayerUrl).toBe(DEFAULT_RELAYER)
  })

  it('should use the configured relayer URL when provided', async () => {
    const mod = await loadFresh({
      VITE_GASLESS_CHECKOUT: '1',
      VITE_RELAYER_URL: 'https://relayer.example.com/v1'
    })
    expect(mod.gaslessConfig.relayerUrl).toBe('https://relayer.example.com/v1')
  })

  it('should keep the configured relayer URL independent of whether gasless is enabled', async () => {
    const mod = await loadFresh({
      VITE_GASLESS_CHECKOUT: '',
      VITE_RELAYER_URL: 'https://relayer.example.com/v1'
    })
    expect(mod.gaslessConfig.enabled).toBe(false)
    expect(mod.gaslessConfig.relayerUrl).toBe('https://relayer.example.com/v1')
  })
})

describe('when reading gaslessEnabled() as a predicate', () => {
  it('should mirror gaslessConfig.enabled exactly', async () => {
    const on = await loadFresh({ VITE_GASLESS_CHECKOUT: 'true' })
    expect(on.gaslessEnabled()).toBe(on.gaslessConfig.enabled)

    const off = await loadFresh({ VITE_GASLESS_CHECKOUT: 'nope' })
    expect(off.gaslessEnabled()).toBe(off.gaslessConfig.enabled)
  })
})
