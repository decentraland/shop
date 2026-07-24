import { PreviewMessageType, sendMessage } from '@dcl/schemas/dist/dapps/preview'

// Best-effort teardown of a wearable-preview iframe before it's unmounted. The aang/Unity runtime holds a
// WebGL context that the browser only reclaims once the iframe element is gone; asking it to `cleanup`
// first lets it release GPU resources promptly (matters most during item→item navigation, where a new
// preview mounts right as the old one leaves). If the postMessage can't be delivered (cross-origin quirk,
// already-detached window, Babylon build with no controller) we swallow it — removing the iframe from the
// DOM, which the caller does by unmounting, is what actually guarantees the context is reclaimed.
export function disposePreview(win: Window | null | undefined): void {
  if (!win) return
  try {
    sendMessage(win, PreviewMessageType.CONTROLLER_REQUEST, {
      id: `dispose-${Date.now()}`,
      namespace: 'scene',
      method: 'cleanup',
      params: []
    })
  } catch {
    // no-op: the unmount (iframe removal) reclaims the WebGL context regardless.
  }
}
