import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PreviewMessageType } from '@dcl/schemas/dist/dapps/preview'

// The only thing worth asserting here is the UPDATE the layer dispatches into the warm iframe — how the
// asset is IDENTIFIED to the preview app. Mock the postMessage channel and stand in for the heavy iframe.
const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('@dcl/schemas/dist/dapps/preview', async importOriginal => {
  const actual = await importOriginal<typeof import('@dcl/schemas/dist/dapps/preview')>()
  return { ...actual, sendMessage }
})

// Stand-in iframe: real element (so getElementById + contentWindow resolve), and it reports the first
// LOAD immediately — that's the engine-booted signal the layer waits for before it will send an UPDATE.
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: ({ id, onLoad }: { id: string; onLoad?: () => void }) => {
    queueMicrotask(() => onLoad?.())
    return <iframe id={id} title="preview" />
  }
}))

vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))

import { HoverPreviewLayer } from './HoverPreviewLayer'
import { useCart } from '~/store/cart'
import { useHoverPreview } from '~/store/hoverPreview'
import type { CatalogItem } from '~/lib/api'

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'i1',
    name: 'Theater',
    creator: '',
    contractAddress: '0xc04528c14c8ffd84c7c1fb6719b4a89853035cdd',
    itemId: '7',
    category: 'wearable',
    rarity: 'legendary',
    network: 'MATIC',
    chainId: 137,
    thumbnail: '',
    priceCredits: 0,
    gender: null,
    isSmart: false,
    ...overrides
  }
}

// The layer defers mounting the iframe to browser idle; jsdom has no requestIdleCallback, so it takes the
// setTimeout path — run the timers to get it mounted. Defaults to a browse grid, the surface hover
// previews exist for.
async function mountLayer(path = '/items') {
  vi.useFakeTimers()
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <HoverPreviewLayer />
    </MemoryRouter>
  )
  await act(async () => {
    vi.advanceTimersByTime(2000)
  })
  vi.useRealTimers()
  // Let the stub iframe's boot LOAD land, which is what unlocks UPDATE dispatch.
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

function lastUpdateOptions() {
  const call = sendMessage.mock.calls.filter(c => c[1] === PreviewMessageType.UPDATE).at(-1)
  return (call?.[2] as { options: Record<string, unknown> } | undefined)?.options
}

beforeEach(() => {
  sendMessage.mockClear()
  useHoverPreview.setState({ item: null, anchor: null, ready: false, token: 0 })
  useCart.setState({ fittingOpen: false })
})

/**
 * The warm engine is an optimisation for card hover, and it is only free where nothing else is rendering.
 * Kept alive on top of a surface that mounts its own preview it becomes a second (with the Fitting Room,
 * a third) live WebGL context on the same page, which is what pegged the GPU.
 */
describe('HoverPreviewLayer — when another surface owns the live preview', () => {
  it.each([
    ['the item detail page', '/item/0xc04528c14c8ffd84c7c1fb6719b4a89853035cdd/7'],
    ['a secondary listing', '/token/0xc04528c14c8ffd84c7c1fb6719b4a89853035cdd/7'],
    ['the outfit detail page', '/items/outfits/3f8e5acc-f952-4efc-8543-a3f6433d9190'],
    ['the outfit studio', '/outfits/manage']
  ])('should keep no engine warm on %s', async (_surface, path) => {
    const { queryByTitle } = await mountLayer(path)

    expect(queryByTitle('preview')).toBeNull()
  })

  it('should keep no engine warm while the fitting room is open', async () => {
    useCart.setState({ fittingOpen: true })

    const { queryByTitle } = await mountLayer()

    expect(queryByTitle('preview')).toBeNull()
  })

  it('should keep one warm on a browse grid, where hover previews are used', async () => {
    const { queryByTitle } = await mountLayer()

    expect(queryByTitle('preview')).not.toBeNull()
  })
})

/**
 * Given only contractAddress + itemId the preview app builds `urn:decentraland:matic:collections-v2:<c>:<i>`
 * and resolves THAT — correct for a Polygon collections-v2 item and wrong for anything else. An Ethereum
 * collections-v1 wearable answers "Could not find wearable or emote for urn=…", never loads, and the layer
 * (which reveals itself only on the resulting LOAD) stays invisible, so the hover preview reads as missing.
 * The catalog feed already returns the real urn, so send that whenever the row has one.
 */
describe('HoverPreviewLayer — how the hovered asset is identified to the preview', () => {
  it('should load a row by its urn when it carries one', async () => {
    await mountLayer()

    await act(async () => {
      useHoverPreview
        .getState()
        .show(
          makeItem({ urn: 'urn:decentraland:ethereum:collections-v1:exclusive_masks:theater_mask' }),
          document.createElement('div')
        )
    })

    const options = lastUpdateOptions()
    expect(options?.urns).toEqual(['urn:decentraland:ethereum:collections-v1:exclusive_masks:theater_mask'])
    // Mutually exclusive: leaving the contract pair in as well would let the preview resolve one and
    // render the other.
    expect(options?.contractAddress).toBeUndefined()
    expect(options?.itemId).toBeUndefined()
  })

  it('should fall back to contractAddress + itemId for a feed that returns no urn', async () => {
    await mountLayer()

    await act(async () => {
      useHoverPreview.getState().show(makeItem(), document.createElement('div'))
    })

    const options = lastUpdateOptions()
    expect(options?.contractAddress).toBe('0xc04528c14c8ffd84c7c1fb6719b4a89853035cdd')
    expect(options?.itemId).toBe('7')
    expect(options?.urns).toBeUndefined()
  })
})
