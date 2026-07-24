import { useEffect, useRef, useState } from 'react'

// A heavy 3D preview (Unity/aang or Babylon) keeps a live WebGL context + render loop running even when
// nobody's looking at it — pegging GPU/CPU while the tab is backgrounded or the preview is scrolled out
// of view. The decentraland-ui2 wrapper exposes no "pause" message, so the pragmatic lever is to
// conditionally render (unmount) the preview and remount it when it's on-screen AND the tab is visible.
//
// Returns a ref to attach to the element that stands in for the preview's box, plus `active` — true only
// while that element intersects the viewport and the tab isn't hidden. Starts `true` so an above-the-fold
// preview mounts immediately (no first-paint flicker); the observer corrects it on the next frame.
export function usePreviewActive<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  )

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => setOnScreen(entries.some(e => e.isIntersecting)), {
      // Remount a little before it scrolls back into view so the 3D scene is ready when it lands.
      rootMargin: '200px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => setTabVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return { ref, active: onScreen && tabVisible }
}
