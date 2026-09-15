import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ContentfulLocale } from '@dcl/schemas'
import type { Campaign } from '~/lib/contentful'

const { useCampaign, useCampaignContracts } = vi.hoisted(() => ({
  useCampaign: vi.fn(),
  useCampaignContracts: vi.fn()
}))
vi.mock('~/hooks/useCampaign', () => ({ useCampaign }))
vi.mock('~/hooks/useCampaignContracts', () => ({ useCampaignContracts }))

import { useEventTab } from './useEventTab'
import { useLocale } from '~/store/locale'

const A = '0xabc0000000000000000000000000000000000001'

function aCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    name: 'Halloween 2026',
    tabName: { [ContentfulLocale.enUS]: 'Halloween', [ContentfulLocale.es]: 'Noche de brujas' },
    mainTag: 'halloween',
    tags: ['halloween'],
    banners: {},
    assets: {},
    ...over
  }
}

const label = () => renderHook(() => useEventTab()).result.current

beforeEach(() => {
  vi.clearAllMocks()
  useLocale.setState({ locale: 'en' })
  useCampaign.mockReturnValue({ campaign: aCampaign(), isPending: false, isError: false })
  useCampaignContracts.mockReturnValue({ contracts: [A], isPending: false, isError: false })
})

describe('useEventTab', () => {
  it('should label the tab with the campaign name from the cms', () => {
    expect(label()).toBe('Halloween')
  })

  it('should label it in the reader’s language', () => {
    useLocale.setState({ locale: 'es' })

    expect(label()).toBe('Noche de brujas')
  })

  it('should show no tab while no campaign is running', () => {
    useCampaign.mockReturnValue({ campaign: undefined, isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should show no tab for a campaign with banners but no event', () => {
    // The normal state for months at a time: banners configured, no campaign entry behind them.
    useCampaign.mockReturnValue({ campaign: aCampaign({ mainTag: null, tags: [] }), isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should show no tab until the event actually has collections in it', () => {
    // An entry is often published days before anyone tags the collections, and a tab that opens an empty
    // grid is worse than no tab.
    useCampaignContracts.mockReturnValue({ contracts: [], isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should show no tab when the campaign has no name to put on it', () => {
    useCampaign.mockReturnValue({ campaign: aCampaign({ tabName: null }), isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should ask for the campaign’s own tags', () => {
    useCampaign.mockReturnValue({
      campaign: aCampaign({ tags: ['halloween', 'spooky'] }),
      isPending: false,
      isError: false
    })

    label()

    expect(useCampaignContracts).toHaveBeenCalledWith(['halloween', 'spooky'])
  })
})
