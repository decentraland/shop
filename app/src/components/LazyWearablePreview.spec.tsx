import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
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

  it('degrades to Babylon on a load error and forwards onError', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onError = vi.fn()
    render(<WearablePreview unity onError={onError} />)
    const el = await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)

    fireEvent.click(el) // iframe reports a load error
    expect(onError).toHaveBeenCalledOnce()
    expect(lastProps.unity).toBe(false) // flipped to Babylon
    expect(track).not.toHaveBeenCalled() // the Unity mount isn't tracked and a load error isn't either
  })

  it('reports the renderer the preview app hands to onLoad', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    render(<WearablePreview unity onRenderer={onRenderer} />)
    await screen.findByTestId('wp')
    expect(onRenderer).not.toHaveBeenCalled() // nothing reported until the scene loads

    act(() => lastProps.onLoad?.(PreviewRenderer.UNITY))
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.UNITY)
  })

  it('reports Babylon via onRenderer when the preview app loads as Babylon', async () => {
    mockPick(PreviewRenderer.BABYLON, 'slow-connection')
    const onRenderer = vi.fn()
    render(<WearablePreview unity onRenderer={onRenderer} />)
    await screen.findByTestId('wp')

    act(() => lastProps.onLoad?.(PreviewRenderer.BABYLON))
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('infers Babylon via onRenderer when the app loads without reporting a renderer', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    const onLoad = vi.fn()
    render(<WearablePreview unity onRenderer={onRenderer} onLoad={onLoad} />)
    await screen.findByTestId('wp')

    act(() => lastProps.onLoad?.(undefined))
    expect(onLoad).toHaveBeenCalledWith(undefined)
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('reports Babylon via onRenderer after a runtime load error', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    render(<WearablePreview unity onRenderer={onRenderer} />)
    const el = await screen.findByTestId('wp')

    fireEvent.click(el) // iframe reports a load error → degrade to Babylon
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('trusts the renderer the preview app reports via onLoad over our attempt', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    const onLoad = vi.fn()
    render(<WearablePreview unity onRenderer={onRenderer} onLoad={onLoad} />)
    await screen.findByTestId('wp')

    // We asked for Unity, but the preview app degraded to Babylon internally and reports it on load.
    act(() => lastProps.onLoad?.(PreviewRenderer.BABYLON))
    expect(onLoad).toHaveBeenCalledWith(PreviewRenderer.BABYLON)
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })
})
