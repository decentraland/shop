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

import { useRunningCampaign } from './useRunningCampaign'
import { useLocale } from '~/store/locale'

const A = '0xabc0000000000000000000000000000000000001'

function aCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    name: 'Halloween 2026',
    tabName: { [ContentfulLocale.enUS]: 'Halloween', [ContentfulLocale.es]: 'Noche de brujas' },
    mainTag: 'halloween',
    tags: ['halloween'],
    collections: [],
    items: [],
    banners: {},
    assets: {},
    ...over
  }
}

const label = () => renderHook(() => useRunningCampaign()).result.current?.label ?? null
const campaignOf = () => renderHook(() => useRunningCampaign()).result.current

beforeEach(() => {
  vi.clearAllMocks()
  useLocale.setState({ locale: 'en' })
  useCampaign.mockReturnValue({ campaign: aCampaign(), isPending: false, isError: false })
  useCampaignContracts.mockReturnValue({ contracts: [A], isPending: false, isError: false })
})

describe('useRunningCampaign', () => {
  it('should carry the collections the event selected', () => {
    expect(campaignOf()?.contracts).toEqual([A])
  })

  it('should label the event with the campaign name from the cms', () => {
    expect(label()).toBe('Halloween')
  })

  it('should label it in the reader’s language', () => {
    useLocale.setState({ locale: 'es' })

    expect(label()).toBe('Noche de brujas')
  })

  it('should report nothing while no campaign is running', () => {
    useCampaign.mockReturnValue({ campaign: undefined, isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should report nothing for a campaign with banners but no event', () => {
    // The normal state for months at a time: banners configured, no campaign entry behind them.
    useCampaign.mockReturnValue({ campaign: aCampaign({ mainTag: null, tags: [] }), isPending: false, isError: false })

    expect(label()).toBeNull()
  })

  it('should report the event even before any collection carries its tag', () => {
    // Deliberate, and it used to be the opposite. An entry is often published days before anyone tags the
    // collections, and withholding the event until then made the Shop disagree with the Marketplace — and
    // made the tab impossible to preview outside production, since no collection on the `.zone` builder
    // carries any tag at all. The grid handles the empty set on its own.
    useCampaignContracts.mockReturnValue({ contracts: [], isPending: false, isError: false })

    expect(label()).toBe('Halloween')
  })

  it('should report nothing when the campaign has no name to put on it', () => {
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

    expect(useCampaignContracts).toHaveBeenCalledWith(['halloween', 'spooky'], [])
  })

  it('should pass the collections the cms names outright, alongside the tags', () => {
    // Tagging happens in the builder, a different tool with a different owner, so an editor with no access
    // there can still add a collection to the event from Contentful.
    const named = ['0xabc0000000000000000000000000000000000001']
    useCampaign.mockReturnValue({ campaign: aCampaign({ collections: named }), isPending: false, isError: false })

    label()

    expect(useCampaignContracts).toHaveBeenCalledWith(['halloween'], named)
  })
})
