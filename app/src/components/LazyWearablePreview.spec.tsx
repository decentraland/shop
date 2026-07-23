import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { pickRenderer } from '~/lib/pickRenderer'
import { track } from '~/lib/analytics'

vi.mock('~/lib/pickRenderer', () => ({ pickRenderer: vi.fn() }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))

// Stand in for the real decentraland-ui2 iframe component; record the props it receives and expose a
// hook to fire onError/onLoad like the real iframe.
type StubProps = {
  unity?: boolean
  unityMode?: PreviewUnityMode
  onError?: (e: Error) => void
  onLoad?: (r?: PreviewRenderer) => void
}
let lastProps: StubProps
vi.mock('decentraland-ui2/dist/components/WearablePreview', () => ({
  WearablePreview: (props: StubProps) => {
    lastProps = props
    return (
      <button data-testid="wp" onClick={() => props.onError?.(new Error('unity failed'))}>
        {`unity=${props.unity} mode=${props.unityMode ?? ''}`}
      </button>
    )
  }
}))

const mockPick = (renderer: PreviewRenderer, reason = 'connection-ok') =>
  vi.mocked(pickRenderer).mockReturnValue({ renderer, reason: reason as never })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('LazyWearablePreview', () => {
  it('attempts Unity with unityMode=marketplace when requested and the gate allows it', async () => {
    mockPick(PreviewRenderer.UNITY)
    render(<WearablePreview unity />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)
    expect(lastProps.unityMode).toBe(PreviewUnityMode.MARKETPLACE)
    expect(track).not.toHaveBeenCalled()
  })

  it('falls back to Babylon and reports the reason when the gate disallows Unity', async () => {
    mockPick(PreviewRenderer.BABYLON, 'slow-connection')
    render(<WearablePreview unity id="hero" />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(lastProps.unityMode).toBeUndefined()
    expect(track).toHaveBeenCalledWith(
      'Shop Preview Renderer Fallback',
      expect.objectContaining({ reason: 'slow-connection', preview_id: 'hero' })
    )
  })

  it('does not track a mobile fallback (expected, high-volume)', async () => {
    mockPick(PreviewRenderer.BABYLON, 'mobile')
    render(<WearablePreview unity id="hero" />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('never evaluates the gate, sends unity, or reports when unity is not requested', async () => {
    render(<WearablePreview />)
    await screen.findByTestId('wp')
    expect(pickRenderer).not.toHaveBeenCalled()
    expect(lastProps.unity).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('honours a caller-supplied unityMode override when Unity is used', async () => {
    mockPick(PreviewRenderer.UNITY)
    render(<WearablePreview unity unityMode={PreviewUnityMode.PROFILE} />)
    await screen.findByTestId('wp')
    expect(lastProps.unityMode).toBe(PreviewUnityMode.PROFILE)
  })

  it('reports a load error and forwards onError without flipping renderer or tracking', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onError = vi.fn()
    render(<WearablePreview unity onError={onError} />)
    const el = await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)

    fireEvent.click(el) // iframe reports a load error
    expect(onError).toHaveBeenCalledOnce()
    expect(console.info).toHaveBeenCalled()
    expect(lastProps.unity).toBe(true) // no state flip
    expect(track).not.toHaveBeenCalled() // Unity mount isn't tracked; a load error is reported, not tracked
  })
})
