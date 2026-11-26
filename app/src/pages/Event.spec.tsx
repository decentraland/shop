import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ContentfulLocale } from '@dcl/schemas'
import type { Campaign } from '~/lib/contentful'
import type { AssetsProps } from '~/pages/Assets'

const { useCampaign, useCampaignFlag, useCampaignContracts, useCampaignTheme } = vi.hoisted(() => ({
  useCampaign: vi.fn(),
  useCampaignFlag: vi.fn(),
  useCampaignContracts: vi.fn(),
  useCampaignTheme: vi.fn()
}))
vi.mock('~/hooks/useCampaign', () => ({ useCampaign, useCampaignFlag }))
vi.mock('~/hooks/useCampaignContracts', () => ({ useCampaignContracts }))
vi.mock('~/hooks/useCampaignTheme', () => ({ useCampaignTheme }))

// A fixture rather than the real list, so the spec does not change every time the season's selection does.
const THEME_EVENT = {
  labelKey: 'campaign.holidaysTab',
  collections: ['0x1110000000000000000000000000000000000001'],
  items: ['0x2220000000000000000000000000000000000002-7']
}
vi.mock('~/lib/campaignEvent', () => ({
  campaignThemeEvent: (theme: string | null) => (theme === 'holidays' ? THEME_EVENT : null)
}))

// The grid is stubbed down to the props it is given: which collections it is pinned to, and the three
// defaults this page has to override, are the whole of what this page decides.
const { assetsProps } = vi.hoisted(() => ({ assetsProps: vi.fn() }))
vi.mock('~/pages/Assets', () => ({
  Assets: (props: AssetsProps) => {
    assetsProps(props)
    return <div data-testid="grid" />
  }
}))

import { Event } from './Event'

const A = '0xabc0000000000000000000000000000000000001'
const B = '0xdef0000000000000000000000000000000000002'

function aCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    name: 'Halloween 2026',
    tabName: { [ContentfulLocale.enUS]: 'Halloween' },
    mainTag: 'halloween',
    tags: ['halloween'],
    collections: [],
    items: [],
    banners: {},
    assets: {},
    ...over
  }
}

function renderEvent() {
  return render(
    <MemoryRouter initialEntries={['/event']}>
      <Routes>
        <Route path="/event" element={<Event />} />
        <Route path="/items" element={<div data-testid="items" />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCampaign.mockReturnValue({ campaign: aCampaign(), isPending: false, isError: false })
  useCampaignContracts.mockReturnValue({ contracts: [A, B], isPending: false, isError: false })
  useCampaignFlag.mockReturnValue({ enabled: true, isPending: false, theme: null })
  useCampaignTheme.mockReturnValue(null)
})

describe('the event page', () => {
  describe('when a campaign is running', () => {
    it('should pin the grid to the campaign’s collections', () => {
      renderEvent()

      expect(assetsProps.mock.calls[0][0].contracts).toEqual([A, B])
    })

    it('should pin the grid to the individual items the campaign names as well', () => {
      // Unioned with the collections server-side: a curated list lives in collections the event does not
      // want whole, so it cannot be expressed by naming collections.
      const items = ['0x81a377fd28e619e4d794aefccc96acc232d17147-0']
      useCampaign.mockReturnValue({ campaign: aCampaign({ items }), isPending: false, isError: false })
      renderEvent()

      expect(assetsProps.mock.calls[0][0].itemIds).toEqual(items)
    })

    it('should pin the status filter to on-sale', () => {
      // Left alone, typing a search flips the default to "everything", which swaps the buyable grid for
      // the view-only one on a surface whose whole point is selling this set.
      renderEvent()

      expect(assetsProps.mock.calls[0][0].lockStatus).toBe('on_sale')
    })

    it('should drop NAMEs from the grid', () => {
      // A NAME can never belong to a collection set, and leaving it offered makes `?category=names`
      // render the NAMEs page inside the event.
      renderEvent()

      expect(assetsProps.mock.calls[0][0].hideNames).toBe(true)
    })

    it('should title the page after the campaign and keep it out of search', () => {
      // Set through the grid rather than by this page: the grid rewrites every managed tag, and its own
      // effect runs last.
      renderEvent()

      expect(assetsProps.mock.calls[0][0].seo).toMatchObject({ title: 'Halloween', noindex: true })
    })
  })

  describe('when the campaign is over', () => {
    it('should send the visitor to the ordinary grid', () => {
      useCampaign.mockReturnValue({ campaign: undefined, isPending: false, isError: false })

      const { getByTestId } = renderEvent()

      expect(getByTestId('items')).toBeInTheDocument()
    })
  })

  describe('while the answer is still unknown', () => {
    it('should wait rather than bounce the visitor away', () => {
      // The trap this guards: reporting "settled, no campaign" during the feature-flag read would send
      // every visitor to /items on a cold load, and then let the event appear behind them.
      useCampaign.mockReturnValue({ campaign: undefined, isPending: true, isError: false })

      const { queryByTestId } = renderEvent()

      expect(queryByTestId('items')).not.toBeInTheDocument()
      expect(queryByTestId('grid')).not.toBeInTheDocument()
    })

    it('should wait while the collections are still resolving', () => {
      useCampaignContracts.mockReturnValue({ contracts: [], isPending: true, isError: false })

      const { queryByTestId } = renderEvent()

      expect(queryByTestId('grid')).not.toBeInTheDocument()
    })
  })

  describe('when the campaign resolved to no collections', () => {
    it('should render the grid empty rather than unfiltered', () => {
      // The safety property of the whole feature: an empty set must reach the grid AS an empty set, so it
      // shows nothing. Dropping it would ask for the entire catalogue and present it as the event.
      useCampaignContracts.mockReturnValue({ contracts: [], isPending: false, isError: false })

      renderEvent()

      expect(assetsProps.mock.calls[0][0].contracts).toEqual([])
    })
  })

  describe('when the theme ships an event of its own', () => {
    beforeEach(() => {
      useCampaignTheme.mockReturnValue('holidays')
      useCampaignContracts.mockReturnValue({ contracts: THEME_EVENT.collections, isPending: false, isError: false })
    })

    it('should pin the grid to its selection and title the page after it, not after the cms campaign', () => {
      renderEvent()

      const props = assetsProps.mock.calls[0][0]
      expect(props.contracts).toEqual(THEME_EVENT.collections)
      expect(props.itemIds).toEqual(THEME_EVENT.items)
      expect(props.seo).toMatchObject({ title: 'Jolly Days', noindex: true })
    })

    it('should stay up with no cms campaign at all', () => {
      useCampaign.mockReturnValue({ campaign: undefined, isPending: false, isError: false })

      const { getByTestId, queryByTestId } = renderEvent()

      expect(getByTestId('grid')).toBeInTheDocument()
      expect(queryByTestId('items')).not.toBeInTheDocument()
    })

    it('should not wait on the cms once the flag has brought the event', () => {
      useCampaign.mockReturnValue({ campaign: undefined, isPending: true, isError: false })

      const { getByTestId } = renderEvent()

      expect(getByTestId('grid')).toBeInTheDocument()
    })
  })

  describe('while only the flag is still answering, with no cms to wait on', () => {
    it('should wait rather than bounce the visitor away', () => {
      useCampaign.mockReturnValue({ campaign: undefined, isPending: false, isError: false })
      useCampaignFlag.mockReturnValue({ enabled: false, isPending: true, theme: null })

      const { queryByTestId } = renderEvent()

      expect(queryByTestId('items')).not.toBeInTheDocument()
      expect(queryByTestId('grid')).not.toBeInTheDocument()
    })
  })
})
