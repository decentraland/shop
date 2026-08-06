import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The home page's live promo tiles.
 *
 * The tile used to gate the avatar on `(hover: hover) and (min-width: 769px)`, so a phone only ever saw
 * the static art. It no longer does — these lock that in, because the gate was invisible in every test
 * (jsdom's matchMedia answers `false`, so the whole live branch was silently never rendered).
 */

const previewProps = vi.fn()
vi.mock('~/components/LazyWearablePreview', () => ({
  WearablePreview: (props: Record<string, unknown>) => {
    previewProps(props)
    return <div data-testid="wearable-preview" />
  }
}))
vi.mock('~/components/AnimatedBackground/AnimatedBackground', () => ({
  default: () => <div data-testid="animated-background" />
}))
vi.mock('decentraland-ui2/dist/components/WearablePreview/useWearablePreviewController', () => ({
  useWearablePreviewController: () => ({ controllerRef: { current: null }, isReady: false })
}))

import { LivePromo } from './LivePromo'

function renderPromo() {
  return render(
    <MemoryRouter>
      <LivePromo
        id="shop-promo-emotes"
        to="/items?category=emote"
        urns={['urn:emote', 'urn:wearable']}
        title="Express with style"
        cta="Explore emotes"
        ariaLabel="Express with style — explore emotes"
        fallback="/promo.png"
        fallbackAlt="Express with style"
      />
    </MemoryRouter>
  )
}

describe('the live promo tile', () => {
  it('runs the live avatar and backdrop whatever the pointer or viewport', async () => {
    renderPromo()
    // Suspense resolves the lazily-imported backdrop on a microtask.
    await act(async () => {})

    expect(await screen.findByTestId('wearable-preview')).toBeTruthy()
    expect(screen.getByTestId('animated-background')).toBeTruthy()
  })

  it('plays the emote first, so both renderers agree on which one drives the motion', async () => {
    renderPromo()
    await act(async () => {})

    expect(previewProps.mock.calls.at(-1)![0].urns).toEqual(['urn:emote', 'urn:wearable'])
  })

  it('falls back to the static art when the preview cannot load', async () => {
    renderPromo()
    await act(async () => {})

    const onError = previewProps.mock.calls.at(-1)![0].onError as () => void
    act(() => onError())

    expect(screen.queryByTestId('wearable-preview')).toBeNull()
    expect(screen.getByAltText('Express with style')).toBeTruthy()
  })
})
