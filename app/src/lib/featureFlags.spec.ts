import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '~/config'
import {
  FeatureFlag,
  getAddressListVariant,
  getIsFeatureEnabled,
  getIsProceedsToTreasuryEnabled,
  resetFeatureFlagsCache
} from '~/lib/featureFlags'

const FLAG_KEY = 'dapps-proceeds-to-treasury'

function mockFlags(flags: Record<string, boolean>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ flags })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('featureFlags', () => {
  beforeEach(() => {
    resetFeatureFlagsCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getIsFeatureEnabled', () => {
    it('should read the flag under the `${app}-${feature}` key the service uses', async () => {
      const fetchMock = mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
      // Same key convention as every other dapp (decentraland-dapps builds it the same way), and the
      // per-environment host — hardcoding `.org` would make it impossible to enable on Amoy alone.
      expect(String(fetchMock.mock.calls[0][0])).toBe(`${config.featureFlagsUrl}/dapps.json`)
    })

    it('should be false for a flag the service does not list', async () => {
      mockFlags({ 'dapps-something-else': true })
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should be false for an explicitly disabled flag', async () => {
      mockFlags({ [FLAG_KEY]: false })
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should fail CLOSED when the flag service is unreachable', async () => {
      // The safe direction: a listing then pays its seller directly in MANA, exactly as before this feature.
      // The dangerous direction is routing proceeds to the treasury unsure that anyone can credit them.
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should fail closed on a non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }))
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should fail closed on a body with no flags object', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should serve repeat reads from cache instead of refetching', async () => {
      const fetchMock = mockFlags({ [FLAG_KEY]: true })

      await getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)
      await getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should share one request between concurrent readers', async () => {
      const fetchMock = mockFlags({ [FLAG_KEY]: true })

      await Promise.all([
        getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY),
        getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY),
        getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)
      ])

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should NOT cache a failure, so an outage does not outlive itself', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags: { [FLAG_KEY]: true } }) })
      vi.stubGlobal('fetch', fetchMock)

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
      // The very next read must try again rather than serve a remembered failure.
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
    })

    it('should abort a hung request rather than hang the caller forever', async () => {
      // A signature dialog waits on this. An unbounded fetch would park the whole sell flow behind the flag
      // service being slow.
      let observedSignal: AbortSignal | undefined
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
          observedSignal = init.signal
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')))
          })
        })
      )
      vi.useFakeTimers()

      const pending = getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)
      await vi.advanceTimersByTimeAsync(3_000)

      await expect(pending).resolves.toBe(false)
      expect(observedSignal?.aborted).toBe(true)
      vi.useRealTimers()
    })
  })

  describe('getIsProceedsToTreasuryEnabled', () => {
    it('should require a configured treasury address AND the runtime flag', async () => {
      // The flag is the only SWITCH, but an address is still required — that is what makes stg/prod safe,
      // since they ship with it empty and cannot route however the flag is set.
      const fetchMock = mockFlags({ [FLAG_KEY]: true })

      const hasAddress = !!config.treasuryAddress
      await expect(getIsProceedsToTreasuryEnabled()).resolves.toBe(hasAddress)
      // With no address the flag is not even fetched — nothing it could say would change the answer.
      expect(fetchMock).toHaveBeenCalledTimes(hasAddress ? 1 : 0)
    })

    it('should be false when the runtime flag is off, however the build is configured', async () => {
      mockFlags({ [FLAG_KEY]: false })
      await expect(getIsProceedsToTreasuryEnabled()).resolves.toBe(false)
    })
  })
  /**
   * The dev override exists so a flag-gated flow can be exercised locally at all. These pin the two properties
   * that make it safe: it never reaches a production bundle, and a malformed entry does NOT silently force a
   * flag off (which would read as "the feature is disabled" rather than "you typed it wrong").
   */
  describe('dev feature flag overrides', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should force a flag on without consulting the service', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury:true')
      const fetchMock = mockFlags({})

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should force a flag off even when the service says it is on', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury:false')
      mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should match on the bare flag name, not the prefixed service key', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', `${FLAG_KEY}:true`)
      mockFlags({})

      // `dapps-proceeds-to-treasury` is the SERVICE key; the override speaks the enum's language.
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })

    it('should leave other flags alone', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'shop-secondary-sales:true')
      mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
    })

    it('should fall through to the real flag when the value is a typo rather than reading it as false', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury:ture')
      mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
    })

    it('should ignore empty entries from a trailing or doubled comma', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', ',proceeds-to-treasury:true,,')
      mockFlags({})

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
      // The empty entries must not be reported as malformed overrides the author never wrote.
      expect(warn).not.toHaveBeenCalled()
    })

    it('should treat an extra colon as malformed rather than dropping the rest of the value', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury:true:extra')
      mockFlags({ [FLAG_KEY]: false })

      // Splitting on every colon would read the value as exactly `true` and force the flag on; splitting once
      // keeps `true:extra`, which is not a valid value, so it falls through to the real flag.
      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
      expect(warn).toHaveBeenCalled()
    })

    it('should warn and fall through for a bare flag name with no value', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('DEV', true)
      // A plausible .env.local typo: the flag named, the `:true` forgotten.
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury')
      mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
      expect(warn).toHaveBeenCalled()
    })

    // Strict lowercase is correct — but nothing stopped a future refactor from "helpfully" lowercasing the
    // value, and `True` reading as true is precisely the kind of leniency that makes an override behave
    // differently from the flag service it stands in for.
    it.each(['True', 'FALSE', 'yes'])('should not accept %s as a value', async value => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', `proceeds-to-treasury:${value}`)
      mockFlags({ [FLAG_KEY]: true })

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(true)
      expect(warn).toHaveBeenCalled()
    })

    it('should be inert outside a dev build, so a stray env var cannot flip a flag in production', async () => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', 'proceeds-to-treasury:true')
      mockFlags({})

      await expect(getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)).resolves.toBe(false)
    })
  })

  describe('dev variant overrides', () => {
    const ADDR_A = '0x' + 'a'.repeat(40)
    const ADDR_B = '0x' + 'b'.repeat(40)

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should serve the override payload without consulting the service', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_VARIANT_OVERRIDES', `shop-outfit-creators:${ADDR_A},${ADDR_B}`)
      const fetchMock = mockFlags({})

      await expect(getAddressListVariant(FeatureFlag.SHOP_OUTFIT_CREATORS)).resolves.toEqual([ADDR_A, ADDR_B])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should parse the override exactly like a dashboard payload (drop junk, lowercase, dedupe)', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv(
        'VITE_FEATURE_FLAG_VARIANT_OVERRIDES',
        `shop-outfit-creators:${ADDR_A.toUpperCase().replace('0X', '0x')}, not-an-address ,${ADDR_A}`
      )
      mockFlags({})

      await expect(getAddressListVariant(FeatureFlag.SHOP_OUTFIT_CREATORS)).resolves.toEqual([ADDR_A])
    })

    it('should fall through to the service for flags the override does not name', async () => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('VITE_FEATURE_FLAG_VARIANT_OVERRIDES', `shop-outfit-creators:${ADDR_A}`)
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            flags: {},
            variants: { 'dapps-shop-prelaunch': { enabled: true, payload: { value: ADDR_B } } }
          })
      })
      vi.stubGlobal('fetch', fetchMock)

      await expect(getAddressListVariant(FeatureFlag.SHOP_PRELAUNCH)).resolves.toEqual([ADDR_B])
      expect(fetchMock).toHaveBeenCalled()
    })
  })
})
