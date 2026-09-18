import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SuggestedItem, SuggestionReasonKind } from '~/lib/api'

/**
 * What the rail REPORTS, which is the reason it exists in a measurable form at all.
 *
 * The rail is judged against Trending on click-through, and a click-through rate is only meaningful
 * if the denominator is honest: every home-page visit has to produce exactly one event, whether the
 * rail rendered or not, and the impression has to mean "seen" rather than "mounted". These specs pin
 * that accounting — one event per visit, the right one, carrying the fields the comparison needs.
 */

const { useSuggestedForYou, track } = vi.hoisted(() => ({
  useSuggestedForYou: vi.fn(),
  track: vi.fn()
}))
vi.mock('~/hooks/useSuggestedForYou', () => ({ useSuggestedForYou }))
vi.mock('~/lib/analytics', () => ({ track }))
// The card has its own coverage; here it is one box on a rail.
vi.mock('~/components/AssetCard', () => ({
  AssetCard: ({ item }: { item: SuggestedItem }) => <div data-testid="asset-card">{item.name}</div>
}))
// Resolving trigger names is a network concern with its own path; the reason copy is covered by
// suggestionReasons.spec.
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }))

import { SuggestedForYouRow } from './SuggestedForYouRow'

function item(i: number, kind: SuggestionReasonKind): SuggestedItem {
  return {
    id: `item-${i}`,
    name: `Item ${i}`,
    creator: '0xcreator',
    contractAddress: '0xabcdef0123456789abcdef0123456789abcdef01',
    itemId: String(i),
    category: 'wearable',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    reason: { kind, itemId: '0xabcdef0123456789abcdef0123456789abcdef01-9' },
    score: 1
  } as unknown as SuggestedItem
}

const READY = {
  isLoading: false,
  isError: false,
  enabled: true,
  hasSignal: true,
  hasAddress: true,
  seedCount: 3,
  fetchMs: 42
}

function hookReturns(overrides: Record<string, unknown>) {
  useSuggestedForYou.mockReturnValue({ ...READY, ...overrides })
}

function renderRow(props: Parameters<typeof SuggestedForYouRow>[0] = {}) {
  return render(
    <MemoryRouter>
      <SuggestedForYouRow {...props} />
    </MemoryRouter>
  )
}

/** The events the rail emitted, by name. */
const emitted = (name: string) => track.mock.calls.filter(call => call[0] === name)

beforeEach(() => {
  track.mockClear()
  useSuggestedForYou.mockReset()
  // jsdom has no IntersectionObserver, which is the branch that reports on mount.
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when the rail renders', () => {
  beforeEach(() => {
    hookReturns({
      result: {
        data: [item(1, 'co_owned'), item(2, 'co_owned'), item(3, 'creator_affinity'), item(4, 'seed_similar')],
        personalized: true,
        algorithm: 'v1'
      }
    })
    renderRow()
  })

  it('should report exactly one impression', () => {
    expect(emitted('viewed_suggestions')).toHaveLength(1)
  })

  it('should not also report itself hidden', () => {
    expect(emitted('hidden_suggestions')).toHaveLength(0)
  })

  it('should carry how many rows were shown', () => {
    expect(emitted('viewed_suggestions')[0][1]).toMatchObject({ count: 4 })
  })

  it('should carry the mix of reasons actually shown, not just the total', () => {
    expect(emitted('viewed_suggestions')[0][1]).toMatchObject({
      reason_counts: { co_owned: 2, creator_affinity: 1, seed_similar: 1 }
    })
  })

  it('should say whether the visitor was signed in, so the two populations can be told apart', () => {
    expect(emitted('viewed_suggestions')[0][1]).toMatchObject({ has_address: true, seed_count: 3 })
  })

  it('should carry the algorithm version so rails from different scorers are comparable', () => {
    expect(emitted('viewed_suggestions')[0][1]).toMatchObject({ algorithm: 'v1', personalized: true })
  })

  it('should carry how long the answer took', () => {
    expect(emitted('viewed_suggestions')[0][1]).toMatchObject({ fetch_ms: 42 })
  })

  it('should render one card per row', () => {
    expect(screen.getAllByTestId('asset-card')).toHaveLength(4)
  })
})

describe('when the rail does not render', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['the flag is off', { enabled: false, hasSignal: false }, 'flag_off'],
    ['the browser knows nothing about the visitor', { hasSignal: false }, 'no_signal'],
    ['the request failed', { isError: true }, 'error'],
    [
      'the server had no personal signal',
      { result: { data: [item(1, 'trending')], personalized: false, algorithm: 'v1' } },
      'not_personalized'
    ],
    [
      'too few rows came back to be worth the space',
      { result: { data: [item(1, 'co_owned')], personalized: true, algorithm: 'v1' } },
      'too_few'
    ]
  ]

  it.each(cases)('should report %s as its reason', (_label, overrides, reason) => {
    hookReturns(overrides)
    renderRow()
    expect(emitted('hidden_suggestions')[0][1]).toMatchObject({ reason })
  })

  it.each(cases)('should report exactly once when %s', (_label, overrides) => {
    hookReturns(overrides)
    renderRow()
    expect(emitted('hidden_suggestions')).toHaveLength(1)
  })

  it.each(cases)('should never also report an impression when %s', (_label, overrides) => {
    hookReturns(overrides)
    renderRow()
    expect(emitted('viewed_suggestions')).toHaveLength(0)
  })

  it.each(cases)('should render nothing at all when %s', (_label, overrides) => {
    hookReturns(overrides)
    renderRow()
    expect(screen.queryByTestId('suggested-row')).toBeNull()
  })

  it('should say what it knew about the visitor, so the absences can be segmented too', () => {
    hookReturns({ hasSignal: false })
    renderRow()
    expect(emitted('hidden_suggestions')[0][1]).toMatchObject({ has_address: true, seed_count: 3 })
  })
})

describe('when the answer has not arrived yet', () => {
  beforeEach(() => {
    hookReturns({ isLoading: true, result: undefined })
    renderRow()
  })

  it('should render nothing, rather than a placeholder rail that may never become real', () => {
    expect(screen.queryByTestId('suggested-row')).toBeNull()
  })

  it('should report neither an impression nor an absence, because neither has happened yet', () => {
    expect(track).not.toHaveBeenCalled()
  })
})

/**
 * The rail now lives on four pages, and every rate it will be judged by is one page's clicks over the
 * SAME page's impressions. If the click carries the surface and the impression does not, those two
 * numbers cannot be divided by each other on any page — which is precisely the state the rail was in
 * when the fourth surface was added.
 */
describe('when the rail reports from a page that is not the home page', () => {
  describe('and it rendered', () => {
    beforeEach(() => {
      hookReturns({
        result: {
          data: [item(0, 'co_owned'), item(1, 'co_owned'), item(2, 'co_owned'), item(3, 'co_owned')],
          personalized: true,
          algorithm: 'v1'
        }
      })
      renderRow({ surface: 'cart' })
    })

    it('should stamp the surface on the impression, which is the denominator of every rate', () => {
      expect(emitted('viewed_suggestions')[0][1]).toEqual(expect.objectContaining({ surface: 'cart' }))
    })
  })

  describe('and it hid itself', () => {
    beforeEach(() => {
      hookReturns({ result: { data: [], personalized: false, algorithm: 'v1' } })
      renderRow({ surface: 'favorites' })
    })

    it('should stamp the surface on the reason it hid, so absence is countable per page too', () => {
      expect(emitted('hidden_suggestions')[0][1]).toEqual(expect.objectContaining({ surface: 'favorites' }))
    })
  })

  describe('and no surface was given', () => {
    beforeEach(() => {
      hookReturns({
        result: {
          data: [item(0, 'co_owned'), item(1, 'co_owned'), item(2, 'co_owned'), item(3, 'co_owned')],
          personalized: true,
          algorithm: 'v1'
        }
      })
      renderRow()
    })

    it('should report the home page, so an unlabelled event is never ambiguous', () => {
      expect(emitted('viewed_suggestions')[0][1]).toEqual(expect.objectContaining({ surface: 'home' }))
    })
  })
})
