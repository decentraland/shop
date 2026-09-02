import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewRenderer, PreviewType } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'

/**
 * The PDP hero preview, and specifically its "On avatar / Item" switch.
 *
 * There was no spec here when the switch was removed, which is why nobody noticed until a shopper did:
 * the preview still rendered, still looked right on first paint, and simply could not be flipped.
 */

// The heavy iframe stands in as a div carrying the props under test, and reports the Babylon renderer —
// the switch is hidden under Unity, whose own scene ships one.
const previewProps = vi.fn()
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: (props: Record<string, unknown>) => {
    previewProps(props)
    const onRenderer = props.onRenderer as ((r: PreviewRenderer) => void) | undefined
    return <div data-testid="wearable-preview" ref={() => onRenderer?.(PreviewRenderer.BABYLON)} />
  }
}))

vi.mock('~/store/wallet', () => ({ useWallet: () => undefined }))
vi.mock('~/store/cart', () => ({ useCart: () => false }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined, isLoading: false }) }))
vi.mock('~/hooks/usePreviewActive', () => ({
  usePreviewActive: () => ({ ref: { current: null }, active: true })
}))
vi.mock('~/components/LazyEmoteControls', () => ({ EmoteControls: () => <div data-testid="emote-frame-input" /> }))

import { ItemPreview } from './ItemPreview'

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: '0xc0-0',
    name: 'Curious Cat Beanie',
    contractAddress: '0xc0',
    itemId: '0',
    tokenId: null,
    category: 'wearable',
    rarity: 'uncommon',
    priceCredits: 11,
    thumbnail: '',
    creator: '0xcc',
    network: 'MATIC',
    chainId: 137,
    ...overrides
  } as CatalogItem
}

function lastPreview(): Record<string, unknown> {
  expect(previewProps).toHaveBeenCalled()
  return previewProps.mock.calls.at(-1)![0]
}

describe('the item preview switch', () => {
  beforeEach(() => previewProps.mockClear())

  it('offers both views for a wearable', () => {
    render(<ItemPreview item={item()} />)

    expect(screen.getByRole('button', { name: 'On avatar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Item' })).toBeTruthy()
  })

  it('opens worn, because that is the decision a shopper is making', () => {
    render(<ItemPreview item={item()} />)

    expect(lastPreview().type).toBe(PreviewType.AVATAR)
    expect(screen.getByRole('button', { name: 'On avatar' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('flips to the item alone, and back', async () => {
    const user = userEvent.setup()
    render(<ItemPreview item={item()} />)

    await user.click(screen.getByRole('button', { name: 'Item' }))
    expect(lastPreview().type).toBe(PreviewType.WEARABLE)
    // No avatar to dress in the item-alone view, so none is requested.
    expect(lastPreview().profile).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'On avatar' }))
    expect(lastPreview().type).toBe(PreviewType.AVATAR)
  })

  // There is no item-alone view of a dance, so the switch would offer a state that does not exist.
  it('offers no switch for an emote', () => {
    render(<ItemPreview item={item({ category: 'emote' })} />)

    expect(screen.queryByRole('button', { name: 'Item' })).toBeNull()
    expect(screen.getByTestId('emote-frame-input')).toBeTruthy()
  })
})

/**
 * How the preview identifies the asset.
 *
 * From a bare contract + item the preview app composes
 * `urn:decentraland:matic:collections-v2:<contract>:<itemId>` and looks THAT up, which only ever resolves
 * Polygon collections-v2. An Ethereum collections-v1 wearable came back as "Could not find wearable or
 * emote for urn=…matic:collections-v2…" printed inside the preview box. HoverPreviewLayer already passes
 * the row's own URN for this reason; the PDP's preview did not.
 */
describe('ItemPreview asset identity', () => {
  beforeEach(() => previewProps.mockClear())

  it('should identify the asset by its own URN when the row carries one', () => {
    render(
      <ItemPreview
        item={item({
          urn: 'urn:decentraland:ethereum:collections-v1:halloween_2019:spider_earrings',
          network: 'ETHEREUM'
        })}
      />
    )

    const props = previewProps.mock.calls.at(-1)![0]
    expect(props.urns).toEqual(['urn:decentraland:ethereum:collections-v1:halloween_2019:spider_earrings'])
    // the pair that would have composed the wrong URN must not be sent alongside it
    expect(props.contractAddress).toBeUndefined()
    expect(props.itemId).toBeUndefined()
  })

  it('should still fall back to contract and item id for a row with no URN', () => {
    render(<ItemPreview item={item()} />)

    const props = previewProps.mock.calls.at(-1)![0]
    expect(props.urns).toBeUndefined()
    expect(props.contractAddress).toBe('0xc0')
    expect(props.itemId).toBe('0')
  })

  it('should keep addressing a secondary listing by its token, which carries no URN', () => {
    render(<ItemPreview item={item({ tokenId: '7', itemId: null })} />)

    const props = previewProps.mock.calls.at(-1)![0]
    expect(props.tokenId).toBe('7')
    expect(props.itemId).toBeUndefined()
  })
})
