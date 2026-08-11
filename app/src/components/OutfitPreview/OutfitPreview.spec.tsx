import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { PreviewEmote } from '@dcl/schemas'

/**
 * How an outfit's own emote reaches the preview.
 *
 * A published emote can only travel as a base64 definition (the renderers ignore an emote urn among the
 * worn list), and the playback bar then has no definition to read `loop` from — it assumes the DEFAULT
 * emote, which loops. That ran a play-once emote's bar forever over an avatar standing still, which is
 * what these cover.
 */

const previewProps = vi.fn()
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: (props: Record<string, unknown>) => {
    previewProps(props)
    return <div data-testid="wearable-preview" />
  }
}))

vi.mock('~/store/cart', () => ({ useCart: () => false }))
vi.mock('~/hooks/usePreviewActive', () => ({
  usePreviewActive: () => ({ ref: { current: null }, active: true })
}))

const playback = vi.fn()
vi.mock('~/hooks/useEmoteBase64', () => ({
  useEmoteBase64: (urn: string | null) => playback(urn)
}))

import { OutfitPreview } from './OutfitPreview'
import { BASE_FEMALE, BASE_MALE } from '~/lib/bodyShape'

const EMOTE_URN = 'urn:decentraland:matic:collections-v2:0xabc:0'
const URNS = ['urn:decentraland:matic:collections-v2:0xdef:1']

function lastProps() {
  return previewProps.mock.calls[previewProps.mock.calls.length - 1][0] as Record<string, unknown>
}

beforeEach(() => {
  previewProps.mockClear()
  playback.mockReturnValue({ base64: null, loop: false, isLoading: false })
})

describe('when the outfit plays one of the built-in animations', () => {
  it('should name it and leave the default emote alone', async () => {
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={PreviewEmote.FASHION} />)

    await waitFor(() => expect(previewProps).toHaveBeenCalled())
    expect(lastProps().emote).toBe(PreviewEmote.FASHION)
    expect(lastProps().base64s).toBeUndefined()
    expect(lastProps().disableDefaultEmotes).toBe(false)
  })
})

describe('when the outfit plays a published emote', () => {
  it('should send the definition instead of naming it', async () => {
    playback.mockReturnValue({ base64: 'BASE64', loop: true, isLoading: false })
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={EMOTE_URN} />)

    await waitFor(() => expect(previewProps).toHaveBeenCalled())
    expect(lastProps().emote).toBeUndefined()
    expect(lastProps().base64s).toEqual(['BASE64'])
  })

  /**
   * The bar reads no `loop` of its own here, so it falls back to the default emote — idle, which loops.
   * Turning the default off is what leaves the bar to stop when a play-once emote does.
   */
  it('should turn the default emote off for a play-once one, so the bar stops with it', async () => {
    playback.mockReturnValue({ base64: 'BASE64', loop: false, isLoading: false })
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={EMOTE_URN} />)

    await waitFor(() => expect(previewProps).toHaveBeenCalled())
    expect(lastProps().disableDefaultEmotes).toBe(true)
  })

  /** A looping emote keeps the fallback, whose verdict — "this loops" — happens to be the right one. */
  it('should keep the default emote for a looping one, so the bar loops with it', async () => {
    playback.mockReturnValue({ base64: 'BASE64', loop: true, isLoading: false })
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={EMOTE_URN} />)

    await waitFor(() => expect(previewProps).toHaveBeenCalled())
    expect(lastProps().disableDefaultEmotes).toBe(false)
  })

  it('should hold the preview until the definition resolves, so the iframe is built once', () => {
    playback.mockReturnValue({ base64: null, loop: false, isLoading: true })
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={EMOTE_URN} />)

    expect(previewProps).not.toHaveBeenCalled()
  })

  it('should still render the outfit when the emote cannot be resolved', async () => {
    playback.mockReturnValue({ base64: null, loop: false, isLoading: false })
    render(<OutfitPreview id="p" profile="default" urns={URNS} emote={EMOTE_URN} />)

    await waitFor(() => expect(previewProps).toHaveBeenCalled())
    expect(lastProps().urns).toEqual(URNS)
    expect(lastProps().base64s).toBeUndefined()
  })
})

/**
 * Every prop that goes into the iframe's src reloads the scene in place when it changes, and the avatar is
 * gone for the whole of that load. The loader is what covers it, so the reset has to name each of those
 * props: `bodyShape` was missing, and the studio changes exactly that — its shape buttons move the mannequin
 * with the profile and the urns held still, so the reload ran with no loader over it at all.
 */
describe('when a loaded preview reloads in place', () => {
  function loader(container: HTMLElement) {
    return container.querySelector('[aria-busy="true"]')
  }

  // The stub above never loads on its own, so land the preview's own onLoad to clear the loader.
  async function land() {
    await act(async () => {
      ;(lastProps().onLoad as () => void)()
    })
  }

  it('should show the loader until the first load lands', async () => {
    const { container } = render(<OutfitPreview id="p" profile="default" urns={URNS} />)
    expect(loader(container)).not.toBeNull()

    await land()

    expect(loader(container)).toBeNull()
  })

  it('should show the loader again when the body shape changes', async () => {
    const { container, rerender } = render(<OutfitPreview id="p" profile="default" bodyShape={BASE_MALE} urns={URNS} />)
    await land()
    expect(loader(container)).toBeNull()

    await act(async () => {
      rerender(<OutfitPreview id="p" profile="default" bodyShape={BASE_FEMALE} urns={URNS} />)
    })

    expect(loader(container)).not.toBeNull()
  })

  it('should show the loader again when the worn urns change', async () => {
    const { container, rerender } = render(<OutfitPreview id="p" profile="default" urns={URNS} />)
    await land()
    expect(loader(container)).toBeNull()

    await act(async () => {
      rerender(
        <OutfitPreview id="p" profile="default" urns={[...URNS, 'urn:decentraland:off-chain:base-avatars:eyes_00']} />
      )
    })

    expect(loader(container)).not.toBeNull()
  })

  it('should render nothing at all when there is nothing to wear', () => {
    const { container } = render(<OutfitPreview id="p" profile="default" urns={[]} />)

    expect(previewProps).not.toHaveBeenCalled()
    expect(loader(container)).toBeNull()
  })
})
