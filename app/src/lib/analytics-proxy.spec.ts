import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getAnalyticsProxyProps, persistSegmentKillSwitch, SEGMENT_KILL_SWITCH_KEY } from './analytics-proxy'

const CDN_URL = 'https://evs.example.org'
const API_HOST = 'api.e.example.org/v1'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('when the kill switch was never persisted', () => {
  it('should hand back the configured proxy, an unknown flag must not reroute analytics', () => {
    expect(getAnalyticsProxyProps(CDN_URL, API_HOST)).toEqual({ cdnUrl: CDN_URL, apiHost: API_HOST })
  })
})

describe('when the kill switch is persisted as off', () => {
  beforeEach(() => persistSegmentKillSwitch(false))

  it('should hand back the configured proxy', () => {
    expect(getAnalyticsProxyProps(CDN_URL, API_HOST)).toEqual({ cdnUrl: CDN_URL, apiHost: API_HOST })
  })
})

describe('when the kill switch is persisted as on', () => {
  beforeEach(() => persistSegmentKillSwitch(true))

  it('should hand back nothing, so the provider mounts on Segment’s own hosts', () => {
    expect(getAnalyticsProxyProps(CDN_URL, API_HOST)).toBeUndefined()
  })

  it('should leave the provider with NO cdnUrl and NO apiHost prop once spread', () => {
    // How main.tsx mounts it: the result is spread into the element, so "no proxy" has to mean the
    // props are absent, not present-and-undefined — @dcl/hooks only falls back to Segment for the former.
    const props = { writeKey: 'write-key', ...getAnalyticsProxyProps(CDN_URL, API_HOST) }

    expect(Object.keys(props)).toEqual(['writeKey'])
  })

  describe('and it is persisted as off again', () => {
    beforeEach(() => persistSegmentKillSwitch(false))

    it('should hand back the configured proxy on the next read', () => {
      expect(getAnalyticsProxyProps(CDN_URL, API_HOST)).toEqual({ cdnUrl: CDN_URL, apiHost: API_HOST })
    })
  })
})

describe('when nothing is configured', () => {
  it('should hand back nothing rather than empty props', () => {
    expect(getAnalyticsProxyProps('', '')).toBeUndefined()
  })
})

describe('when only one half is configured', () => {
  it('should hand back just that half, the bundle and the ingestion route are independent', () => {
    expect(getAnalyticsProxyProps(CDN_URL, '')).toEqual({ cdnUrl: CDN_URL })
    expect(getAnalyticsProxyProps('', API_HOST)).toEqual({ apiHost: API_HOST })
  })
})

describe('when persisting the kill switch', () => {
  it('should store a value the next boot can read synchronously', () => {
    persistSegmentKillSwitch(true)
    expect(localStorage.getItem(SEGMENT_KILL_SWITCH_KEY)).toBe('1')

    persistSegmentKillSwitch(false)
    expect(localStorage.getItem(SEGMENT_KILL_SWITCH_KEY)).toBe('0')
  })

  it('should not throw when storage is unavailable, as in private mode', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => persistSegmentKillSwitch(true)).not.toThrow()
  })
})

describe('when storage cannot be read at all', () => {
  it('should keep the configured proxy, a storage failure must not turn tracking off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(getAnalyticsProxyProps(CDN_URL, API_HOST)).toEqual({ cdnUrl: CDN_URL, apiHost: API_HOST })
  })
})
