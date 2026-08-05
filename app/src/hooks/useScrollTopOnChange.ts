import { useEffect, useRef } from 'react'

/**
 * Puts the page back at the top when `key` changes — for a filter that REPLACES the result set rather
 * than extending it.
 *
 * Picking a category two screens down a grid left the reader mid-way through results they had never seen,
 * often past the end of a shorter set, which reads as an empty page. Paging (LoadMore) deliberately does
 * NOT do this: there the rows above are still the ones they were reading.
 *
 * Skips the first run, so arriving on a page — including via the back button, where the browser is
 * restoring a position — never moves the viewport. `ScrollReset` owns the route-change case.
 */
export function useScrollTopOnChange(key: string) {
  const previous = useRef<string | null>(null)

  useEffect(() => {
    const last = previous.current
    previous.current = key
    if (last === null || last === key) return
    // `instant`, not smooth: animating it looks like the page scrolled itself.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [key])
}
