import { useEffect, useState } from 'react'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { config } from '~/config'

// Warms the 3D item-preview pipeline: once the browser is idle it mounts a single hidden
// WearablePreview so the preview app bundle + 3D engine + content connections are cached. The
// per-card hover previews then boot from cache and feel near-instant. One offscreen iframe app-wide.
export function PreviewWarmer() {
  const [warm, setWarm] = useState(false)

  useEffect(() => {
    // Defer to browser idle so warming never competes with the initial page render.
    // requestIdleCallback is missing on Safari/custom-WebKit — fall back to a timer there.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setWarm(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(() => setWarm(true), 1500)
    return () => window.clearTimeout(id)
  }, [])

  if (!warm) return null

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: -9999, top: -9999, width: 2, height: 2, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <WearablePreview id="preview-warmer" profile="default" dev={config.chainId === 80002} disableBackground disableFadeEffect />
    </div>
  )
}
