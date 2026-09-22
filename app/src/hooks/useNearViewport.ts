import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has come within `rootMargin` of the viewport — and true from then on.
 *
 * The one-way latch is the difference from `usePreviewActive`, which flips back off when its element
 * leaves. Use this for something that is expensive to START and cheap to keep: a third-party embed the
 * visitor may already be typing into, where tearing it down on scroll would throw their input away.
 *
 * `loading="lazy"` is NOT a substitute, which is how this hook came to exist. The browser decides whether
 * a lazy frame is "near" using the layout it has at that moment, and during the first paint the page is a
 * column of skeletons — so the footer sits a few hundred pixels down, inside the threshold, and the embed
 * loads eagerly after all. An observer answers against the laid-out page instead.
 */
export function useNearViewport<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    // Nothing to observe with: show it. A missing observer must not mean a permanently empty box.
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setNear(true)
        io.disconnect()
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return { ref, near }
}
