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
// Starts INACTIVE and waits for the observer's first callback, which arrives before the first paint of a
// preview that is genuinely on screen. It used to start active "so an above-the-fold preview mounts with no
// flicker", and the cost of that was paid by the ones that are not: the home page's two promo tiles sit
// ~2000px down, and on a slow first load they got far enough to request their iframes — a 3.8MB Babylon
// bundle each — before the observer could correct them. The saving is real and the flicker was not: every
// consumer already renders a static image or skeleton until the scene reports ready.
//
// Returns a ref to attach to the element that stands in for the preview's box, plus `active` — true while
// that element intersects the viewport.
export function usePreviewActive<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [onScreen, setOnScreen] = useState(false)

  useEffect(() => {
    const el = ref.current
    // Nothing to observe, or nothing to observe it with: mount. Not being able to answer "is this on
    // screen?" is not a reason to withhold the preview forever — that would be a blank box, which is worse
    // than a preview nobody is looking at.
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true)
      return
    }
    const io = new IntersectionObserver(entries => setOnScreen(entries.some(e => e.isIntersecting)), {
      // Remount a little before it scrolls back into view so the 3D scene is ready when it lands.
      rootMargin: '200px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return { ref, active: onScreen }
}
