import { useEffect } from 'react'

/**
 * Freezes the page behind an open modal.
 *
 * Mounted ONCE, from App. It watches for `[role="dialog"][aria-modal="true"]` rather than being called by
 * each modal: there are eighteen of them, a nineteenth is written every few weeks, and a lock that has to
 * be remembered per component is a lock that will be forgotten. The selector is the accessibility contract
 * a modal already has to satisfy, so enrolling is automatic — and `aria-modal` is what separates a real
 * modal from a non-modal dialog, which is why the notifications panel (a dropdown that says `role="dialog"`)
 * correctly keeps the page scrollable.
 *
 * The scrollbar's width is handed back as padding. Without it, hiding the bar widens the viewport and the
 * whole page jumps sideways as the modal opens. Note this is NOT `scrollbar-gutter: stable`, which was
 * tried and reverted (see styles/index.css): that reserves the track permanently and leaves a seam beside
 * every full-width band. This padding exists only while a modal is open, under its own scrim.
 *
 * The hidden overflow goes on <html>, not only on <body>. The usual `body { overflow: hidden }` is inert
 * in this app: body's overflow only reaches the viewport when <html> is `visible`, and index.css sets
 * `html { overflow-x: clip }` to stop sideways drift. With that in place the page kept scrolling behind an
 * open modal and nothing looked wrong in the CSS.
 */
export function useDialogScrollLock(): void {
  useEffect(() => {
    const body = document.body
    const root = document.documentElement
    let locked = false
    let previous: { overflowY: string; paddingRight: string } | null = null

    const release = () => {
      if (!previous) return
      // Restored to what was there before, not to `''`: another rule may own these.
      root.style.overflowY = previous.overflowY
      body.style.paddingRight = previous.paddingRight
      previous = null
    }

    const apply = () => {
      const open = document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      if (open === locked) return
      locked = open
      if (open) {
        previous = { overflowY: root.style.overflowY, paddingRight: body.style.paddingRight }
        // Zero where the scrollbar is an overlay (macOS, touch), so most viewers get no padding at all.
        const gap = window.innerWidth - root.clientWidth
        root.style.overflowY = 'hidden'
        if (gap > 0) body.style.paddingRight = `${gap}px`
      } else {
        release()
      }
    }

    const observer = new MutationObserver(apply)
    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal']
    })
    apply()

    return () => {
      observer.disconnect()
      locked = false
      release()
    }
  }, [])
}
