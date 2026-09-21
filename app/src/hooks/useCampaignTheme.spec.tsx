import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Campaign } from '~/lib/contentful'

const { useCampaign, useCampaignEnabled, getVariantValue } = vi.hoisted(() => ({
  useCampaign: vi.fn(),
  useCampaignEnabled: vi.fn(),
  getVariantValue: vi.fn()
}))
vi.mock('~/hooks/useCampaign', () => ({ useCampaign, useCampaignEnabled }))
vi.mock('~/lib/featureFlags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/featureFlags')>()),
  getVariantValue
}))

// react-query's own provider is not worth a wrapper here: the hook only ever reads `data`, so a stub that
// runs the query function synchronously exercises exactly the branch under test.
const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery }))

import { useCampaignTheme, useCampaignThemeAttribute } from './useCampaignTheme'

function aCampaign(mainTag: string | null): Campaign {
  return { name: 'Halloween 2026', tabName: null, mainTag, tags: [], collections: [], banners: {}, assets: {} }
}

/** Arranges the three inputs the hook reads: the flag, the variant payload and the CMS campaign. */
function arrange({
  enabled = true,
  variant = null as string | null,
  mainTag = null as string | null,
  variantPending = false
} = {}) {
  useCampaignEnabled.mockReturnValue(enabled)
  useCampaign.mockReturnValue({ campaign: aCampaign(mainTag), isPending: false, isError: false })
  getVariantValue.mockResolvedValue(variant)
  useQuery.mockImplementation(({ enabled: queryEnabled }: { enabled?: boolean }) => ({
    data: queryEnabled === false || variantPending ? undefined : variant,
    isPending: variantPending
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  delete document.documentElement.dataset.campaignTheme
})

describe('useCampaignTheme', () => {
  it('wears the theme the flag variant names', () => {
    arrange({ variant: 'halloween' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBe('halloween')
  })

  it("falls back to the campaign's own tag when the variant names nothing", () => {
    arrange({ variant: null, mainTag: 'Halloween' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBe('halloween')
  })

  it('lets a payload that names no theme take the skin off a themed campaign', () => {
    // The operator's kill switch for the skin alone: `none` in the variant beats a `halloween` tag, so
    // the Shop goes back to purple without anyone editing the CMS.
    arrange({ variant: 'none', mainTag: 'halloween' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBeNull()
  })

  it('wears nothing for a campaign whose tag names no theme', () => {
    arrange({ mainTag: 'prom' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBeNull()
  })

  it('wears nothing until the variant has answered, so the CMS cannot win the race', () => {
    // The two sources are separate queries against different backends. If the tag were honoured while the
    // payload is still in flight, an operator who set the kill switch would still see the skin flash.
    arrange({ variantPending: true, mainTag: 'halloween' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBeNull()
  })

  it('wears nothing while the event surfaces are switched off', () => {
    arrange({ enabled: false, variant: 'halloween', mainTag: 'halloween' })
    expect(renderHook(() => useCampaignTheme()).result.current).toBeNull()
  })
})

describe('useCampaignThemeAttribute', () => {
  it('publishes the theme on the document root', () => {
    arrange({ variant: 'halloween' })
    renderHook(() => useCampaignThemeAttribute())
    expect(document.documentElement.dataset.campaignTheme).toBe('halloween')
  })

  it('hands the theme back, so a caller does not subscribe to the same queries twice', () => {
    arrange({ variant: 'halloween' })
    expect(renderHook(() => useCampaignThemeAttribute()).result.current).toBe('halloween')
  })

  it('leaves the root untouched when nothing is running', () => {
    arrange({ mainTag: 'prom' })
    renderHook(() => useCampaignThemeAttribute())
    expect(document.documentElement.dataset.campaignTheme).toBeUndefined()
  })

  it('takes the skin off when the hook unmounts', () => {
    arrange({ variant: 'halloween' })
    renderHook(() => useCampaignThemeAttribute()).unmount()
    expect(document.documentElement.dataset.campaignTheme).toBeUndefined()
  })
})
