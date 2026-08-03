import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
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

const stubFlag = (enabled: boolean) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flags: { 'dapps-unity-wearable-preview': enabled } })
    })
  )

function renderPreview(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetFeatureFlagsCache()
  stubFlag(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LazyWearablePreview', () => {
  it('attempts Unity with unityMode=marketplace when requested and the gate allows it', async () => {
    mockPick(PreviewRenderer.UNITY)
    renderPreview(<WearablePreview unity />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)
    expect(lastProps.unityMode).toBe(PreviewUnityMode.MARKETPLACE)
    expect(track).not.toHaveBeenCalled()
  })

  it('falls back to Babylon and reports the reason when the gate disallows Unity', async () => {
    mockPick(PreviewRenderer.BABYLON, 'slow-connection')
    renderPreview(<WearablePreview unity id="hero" />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(track).toHaveBeenCalledWith(
      'Shop Preview Renderer Fallback',
      expect.objectContaining({ reason: 'slow-connection', preview_id: 'hero' })
    )
  })

  it('does not track a mobile fallback (expected, high-volume)', async () => {
    mockPick(PreviewRenderer.BABYLON, 'mobile')
    renderPreview(<WearablePreview unity id="hero" />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('does not track the intentional Babylon kill-switch default', async () => {
    mockPick(PreviewRenderer.BABYLON, 'default-babylon')
    renderPreview(<WearablePreview unity id="hero" />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('never evaluates the gate, sends unity, or reports when unity is not requested', async () => {
    renderPreview(<WearablePreview />)
    await screen.findByTestId('wp')
    expect(pickRenderer).not.toHaveBeenCalled()
    expect(lastProps.unity).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('honours a caller-supplied unityMode override when Unity is used', async () => {
    mockPick(PreviewRenderer.UNITY)
    renderPreview(<WearablePreview unity unityMode={PreviewUnityMode.PROFILE} />)
    await screen.findByTestId('wp')
    expect(lastProps.unityMode).toBe(PreviewUnityMode.PROFILE)
  })

  it('degrades to Babylon on a load error and forwards onError', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onError = vi.fn()
    renderPreview(<WearablePreview unity onError={onError} />)
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
    renderPreview(<WearablePreview unity onRenderer={onRenderer} />)
    await screen.findByTestId('wp')
    expect(onRenderer).not.toHaveBeenCalled() // nothing reported until the scene loads

    act(() => lastProps.onLoad?.(PreviewRenderer.UNITY))
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.UNITY)
  })

  it('reports Babylon via onRenderer when the preview app loads as Babylon', async () => {
    mockPick(PreviewRenderer.BABYLON, 'slow-connection')
    const onRenderer = vi.fn()
    renderPreview(<WearablePreview unity onRenderer={onRenderer} />)
    await screen.findByTestId('wp')

    act(() => lastProps.onLoad?.(PreviewRenderer.BABYLON))
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('infers Babylon via onRenderer when the app loads without reporting a renderer', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    const onLoad = vi.fn()
    renderPreview(<WearablePreview unity onRenderer={onRenderer} onLoad={onLoad} />)
    await screen.findByTestId('wp')

    act(() => lastProps.onLoad?.(undefined))
    expect(onLoad).toHaveBeenCalledWith(undefined)
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('reports Babylon via onRenderer after a runtime load error', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    renderPreview(<WearablePreview unity onRenderer={onRenderer} />)
    const el = await screen.findByTestId('wp')

    fireEvent.click(el) // iframe reports a load error → degrade to Babylon
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  it('trusts the renderer the preview app reports via onLoad over our attempt', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onRenderer = vi.fn()
    const onLoad = vi.fn()
    renderPreview(<WearablePreview unity onRenderer={onRenderer} onLoad={onLoad} />)
    await screen.findByTestId('wp')

    // We asked for Unity, but the preview app degraded to Babylon internally and reports it on load.
    act(() => lastProps.onLoad?.(PreviewRenderer.BABYLON))
    expect(onLoad).toHaveBeenCalledWith(PreviewRenderer.BABYLON)
    expect(onRenderer).toHaveBeenLastCalledWith(PreviewRenderer.BABYLON)
  })

  describe('when the unity-wearable-preview flag is off', () => {
    it('uses Babylon without consulting the device gate', async () => {
      stubFlag(false)
      mockPick(PreviewRenderer.UNITY)
      renderPreview(<WearablePreview unity id="hero" />)
      await screen.findByTestId('wp')
      expect(lastProps.unity).toBe(false)
      expect(lastProps.unityMode).toBeUndefined()
      // The flag is a ceiling: with Unity switched off globally there is no device fallback to report.
      expect(pickRenderer).not.toHaveBeenCalled()
      expect(track).not.toHaveBeenCalled()
    })

    it('uses Babylon when the flag service is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      mockPick(PreviewRenderer.UNITY)
      renderPreview(<WearablePreview unity />)
      await screen.findByTestId('wp')
      expect(lastProps.unity).toBe(false)
    })
  })

  it('renders nothing until the flag resolves, so no Babylon scene is loaded and thrown away', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    mockPick(PreviewRenderer.UNITY)
    renderPreview(<WearablePreview unity />)
    expect(screen.queryByTestId('wp')).toBeNull()
    expect(pickRenderer).not.toHaveBeenCalled()
  })
})
