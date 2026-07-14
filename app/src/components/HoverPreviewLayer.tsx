import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { PreviewMessageType, sendMessage } from '@dcl/schemas/dist/dapps/preview'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { config } from '~/config'
import { useHoverPreview } from '~/store/hoverPreview'

// ONE persistent WearablePreview for the whole app. It boots a single 3D engine once (while the
// browser is idle) and then, on card hover, is repositioned over the hovered card and told to load
// that card's wearable via a postMessage UPDATE — the SAME channel WearablePreview uses internally.
// Its own `src` never changes (stable base props: default avatar, no item), so the iframe never
// reloads: a hover swaps the loaded GLB on a warm engine instead of standing up a fresh iframe +
// WebGL context + engine from scratch (what per-card previews did, and why hover felt slow).
//
// The layer is pointer-events:none and sits above the card media, so hovering/clicking passes
// straight through to the card (hover stays active; the whole-card link still navigates) and the
// cross-origin iframe never surfaces its internal content-URL tooltip.
const IFRAME_ID = 'hover-preview'

export function HoverPreviewLayer() {
  const item = useHoverPreview(s => s.item)
  const anchor = useHoverPreview(s => s.anchor)
  const token = useHoverPreview(s => s.token)
  const ready = useHoverPreview(s => s.ready)
  const setReady = useHoverPreview(s => s.setReady)

  // Defer mounting the iframe to browser idle so warming never competes with the initial page render.
  const [mounted, setMounted] = useState(false)
  const [booted, setBooted] = useState(false) // engine up (first default-avatar LOAD seen)
  const bootedRef = useRef(false)
  // The token we last asked the engine to load — a LOAD only means "ready" if it still matches.
  const loadingTokenRef = useRef(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setMounted(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(() => setMounted(true), 1500)
    return () => window.clearTimeout(id)
  }, [])

  // Track the anchored card's on-screen rect; follow it on scroll/resize while a preview is active.
  useEffect(() => {
    if (!anchor) {
      setRect(null)
      return
    }
    let raf = 0
    const update = () => setRect(anchor.getBoundingClientRect())
    update()
    const onMove = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [anchor])

  // Point the warm engine at the hovered item. Re-runs when the item/token changes, and once more when
  // the engine boots (so an item hovered before boot still loads). UPDATE is dropped by the app before
  // it's READY, hence the boot gate + resend.
  useEffect(() => {
    if (!item) return
    const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null
    if (!iframe?.contentWindow) return
    loadingTokenRef.current = token
    if (!bootedRef.current) return
    const isEmote = item.category === 'emote'
    sendMessage(iframe.contentWindow, PreviewMessageType.UPDATE, {
      options: {
        contractAddress: item.contractAddress,
        itemId: item.itemId ?? undefined,
        profile: 'default',
        // Load straight into the fashion pose (like the per-card previews) so the avatar doesn't flash
        // a T-pose; emotes auto-detect + play their own animation.
        type: isEmote ? undefined : PreviewType.AVATAR,
        emote: isEmote ? undefined : PreviewEmote.FASHION,
        disableBackground: true,
        disableFadeEffect: true
      }
    })
  }, [item, token, booted])

  function handleLoad() {
    // The FIRST LOAD is the default avatar rendering = engine booted; it's not an item load.
    if (!bootedRef.current) {
      bootedRef.current = true
      setBooted(true)
      return
    }
    // A later LOAD is the response to our latest UPDATE — mark ready only if it's still the current one.
    if (useHoverPreview.getState().token === loadingTokenRef.current) setReady()
  }

  if (!mounted) return null

  const active = !!item && !!rect
  const wrapStyle: CSSProperties = active
    ? {
        position: 'fixed',
        left: rect!.left,
        top: rect!.top,
        width: rect!.width,
        height: rect!.height,
        zIndex: 5,
        pointerEvents: 'none',
        opacity: ready ? 1 : 0,
        transition: 'opacity .25s ease'
      }
    : // Parked offscreen but kept mounted so the engine stays warm between hovers.
      { position: 'fixed', left: -9999, top: -9999, width: 2, height: 2, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }

  return (
    <div className="hover-preview" aria-hidden style={wrapStyle}>
      <WearablePreview
        id={IFRAME_ID}
        profile="default"
        disableBackground
        disableFadeEffect
        dev={config.chainId === 80002}
        onLoad={handleLoad}
      />
    </div>
  )
}
