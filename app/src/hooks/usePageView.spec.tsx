import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalyticsProvider } from '@dcl/hooks'
import { usePageView, pageNameFor } from './usePageView'

// The real provider is what this exercises, so only Segment itself is stubbed: the provider registers
// this instance in @dcl/hooks' registry, which is where `trackPage` reads it from.
const loaded = vi.hoisted(() => ({
  track: vi.fn(() => Promise.resolve()),
  identify: vi.fn(() => Promise.resolve()),
  page: vi.fn(() => Promise.resolve()),
  reset: vi.fn(() => Promise.resolve())
}))
vi.mock('@segment/analytics-next', () => ({ AnalyticsBrowser: { load: () => loaded } }))

function Probe() {
  usePageView()
  return null
}

async function renderAt(path: string) {
  const view = render(
    <AnalyticsProvider writeKey="wk_test">
      <MemoryRouter initialEntries={[path]}>
        <Probe />
      </MemoryRouter>
    </AnalyticsProvider>
  )
  // Let the provider's dynamic import of analytics-next resolve.
  await act(async () => {})
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePageView', () => {
  it('emits the landing page view, which needs analytics to be initialized first', async () => {
    // React runs a child's effect before its parent's, and the provider awaits an import on top of
    // that, so an ungated effect fires while the registry is still empty and the event is lost for
    // good: the pathname never changes afterwards, so nothing re-fires it.
    await renderAt('/overview')

    expect(loaded.track).toHaveBeenCalledWith('Shop Viewed Page', expect.objectContaining({ page: 'overview' }))
  })

  it('emits it as a Track event, never as a Segment page call', async () => {
    await renderAt('/cart')

    expect(loaded.track).toHaveBeenCalledWith('Shop Viewed Page', expect.objectContaining({ page: 'cart' }))
    expect(loaded.page).not.toHaveBeenCalled()
  })

  it('emits one event per route, not one per render', async () => {
    const { rerender } = await renderAt('/items')

    rerender(
      <AnalyticsProvider writeKey="wk_test">
        <MemoryRouter initialEntries={['/items']}>
          <Probe />
        </MemoryRouter>
      </AnalyticsProvider>
    )
    await act(async () => {})

    expect(loaded.track).toHaveBeenCalledTimes(1)
  })
})

describe('pageNameFor', () => {
  it('names the static routes from the table', () => {
    expect(pageNameFor('/my-favorites')).toBe('favorites')
  })

  it('collapses the dynamic routes onto their section', () => {
    expect(pageNameFor('/item/0xabc/5')).toBe('item')
    expect(pageNameFor('/token/0xabc/5')).toBe('item')
    expect(pageNameFor('/collection/0xabc')).toBe('collection')
    expect(pageNameFor('/items/creator/0xabc')).toBe('creator')
    expect(pageNameFor('/items/outfits/1')).toBe('outfit')
    expect(pageNameFor('/outfits/1')).toBe('outfit_studio')
  })

  it('falls back to other for an unknown route', () => {
    expect(pageNameFor('/nope')).toBe('other')
  })
})
