import { useEffect, useRef } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom'

/**
 * Puts a newly-navigated page at the top.
 *
 * React Router does not touch the window scroll on a client-side navigation, so every route change kept
 * whatever offset the previous page had. Going from a scrolled catalogue into the cart landed the buyer in
 * the footer of a page they had never seen — it reads as a broken page rather than a preserved position.
 *
 * Only for PUSH and REPLACE. A POP is a back/forward, where the browser is restoring a position the user
 * had already been at, and forcing them to the top there would be the actual bug: they lose their place in
 * a long grid every time they come back from an item. That distinction is the whole reason this isn't a
 * one-line `window.scrollTo` on pathname.
 *
 * Keyed on the pathname alone, not the search string: paging or filtering the grid updates the query and
 * should NOT yank the viewport around mid-browse.
 */
export function ScrollReset() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  // The pathname this last ran for. Comparing against it — rather than relying on the effect's deps — is
  // what makes the query-string case work: `navigationType` flips from POP to PUSH on the first in-app
  // navigation, which re-runs the effect even when the path did not change.
  const lastPathname = useRef<string | null>(null)

  useEffect(() => {
    const previous = lastPathname.current
    lastPathname.current = pathname

    // First render: the browser has already positioned the page (a reload, or a deep link with a hash).
    if (previous === null) return
    // Same page, different query — paging or filtering the grid. Never move the viewport mid-browse.
    if (previous === pathname) return
    // Back/forward: the browser restores where the user already was.
    if (navigationType === NavigationType.Pop) return

    // `instant` rather than smooth: this is a new page, not a movement within one, and animating it looks
    // like the page scrolled itself.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, navigationType])

  return null
}

export default ScrollReset
