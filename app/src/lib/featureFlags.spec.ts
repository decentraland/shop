import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '~/config'
import {
  FeatureFlag,
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
})
