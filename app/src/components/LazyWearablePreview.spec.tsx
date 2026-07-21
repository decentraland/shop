import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { pickRenderer } from '~/lib/pickRenderer'

vi.mock('~/lib/pickRenderer', () => ({ pickRenderer: vi.fn() }))

// Stand in for the real decentraland-ui2 iframe component; record the props it receives and expose a
// hook to fire onError like a failed Unity load.
type StubProps = { unity?: boolean; unityMode?: PreviewUnityMode; onError?: (e: Error) => void }
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

const mockPick = (renderer: PreviewRenderer) =>
  vi.mocked(pickRenderer).mockReturnValue({ renderer, reason: 'connection-ok' })

beforeEach(() => vi.clearAllMocks())

describe('LazyWearablePreview', () => {
  it('attempts Unity with unityMode=marketplace when requested and the gate allows it', async () => {
    mockPick(PreviewRenderer.UNITY)
    render(<WearablePreview unity />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)
    expect(lastProps.unityMode).toBe(PreviewUnityMode.MARKETPLACE)
  })

  it('falls back to Babylon when unity is requested but the gate disallows it', async () => {
    mockPick(PreviewRenderer.BABYLON)
    render(<WearablePreview unity />)
    await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(false)
    expect(lastProps.unityMode).toBeUndefined()
  })

  it('never evaluates the gate or sends unity when unity is not requested', async () => {
    render(<WearablePreview />)
    await screen.findByTestId('wp')
    expect(pickRenderer).not.toHaveBeenCalled()
    expect(lastProps.unity).toBe(false)
    expect(lastProps.unityMode).toBeUndefined()
  })

  it('honours a caller-supplied unityMode override when Unity is used', async () => {
    mockPick(PreviewRenderer.UNITY)
    render(<WearablePreview unity unityMode={PreviewUnityMode.PROFILE} />)
    await screen.findByTestId('wp')
    expect(lastProps.unityMode).toBe(PreviewUnityMode.PROFILE)
  })

  it('degrades to Babylon on a Unity load error and forwards onError', async () => {
    mockPick(PreviewRenderer.UNITY)
    const onError = vi.fn()
    render(<WearablePreview unity onError={onError} />)
    const el = await screen.findByTestId('wp')
    expect(lastProps.unity).toBe(true)

    fireEvent.click(el) // simulate the iframe reporting a load error
    expect(lastProps.unity).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
  })
})
