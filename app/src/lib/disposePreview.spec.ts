import { describe, it, expect, vi } from 'vitest'
import { PreviewMessageType } from '@dcl/schemas'
import { disposePreview } from '~/lib/disposePreview'

describe('disposePreview', () => {
  it('posts a scene.cleanup controller request to the iframe window', () => {
    const postMessage = vi.fn()
    disposePreview({ postMessage } as unknown as Window)

    expect(postMessage).toHaveBeenCalledTimes(1)
    const [event, targetOrigin] = postMessage.mock.calls[0]
    expect(event).toMatchObject({
      type: PreviewMessageType.CONTROLLER_REQUEST,
      payload: { namespace: 'scene', method: 'cleanup', params: [] }
    })
    expect(typeof event.payload.id).toBe('string')
    expect(targetOrigin).toBe('*')
  })

  it('is a no-op when there is no window (already unmounted)', () => {
    expect(() => disposePreview(null)).not.toThrow()
    expect(() => disposePreview(undefined)).not.toThrow()
  })

  it('swallows a postMessage failure (cross-origin / detached window)', () => {
    const postMessage = vi.fn(() => {
      throw new Error('cross-origin')
    })
    expect(() => disposePreview({ postMessage } as unknown as Window)).not.toThrow()
  })
})
