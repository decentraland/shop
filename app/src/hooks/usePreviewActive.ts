import { useEffect, useRef, useState } from 'react'

// A heavy 3D preview (Unity/aang or Babylon) keeps a live WebGL context + render loop running even when
// nobody's looking at it. The decentraland-ui2 wrapper exposes no "pause" message, so the pragmatic lever is
// to conditionally render (unmount) the preview and remount it when it is back on screen.
//
// SCROLL only, deliberately not tab visibility. Unmounting on `visibilitychange` meant every trip to another
// tab threw the loaded scene away, and coming back paid the multi-second reload again, spinner and all — for
// no saving: browsers already clamp rAF to a near-stop in a hidden tab, so the backgrounded preview costs
// almost nothing to keep. Off-screen is the case where the render loop really does run at full speed with
// nobody watching, and that one is still unmounted.
//
// Returns a ref to attach to the element that stands in for the preview's box, plus `active` — true while
// that element intersects the viewport. Starts `true` so an above-the-fold preview mounts immediately (no
// first-paint flicker); the observer corrects it on the next frame.
export function usePreviewActive<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [onScreen, setOnScreen] = useState(true)

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

  return { ref, active: onScreen }
}
