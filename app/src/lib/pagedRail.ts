// Paging math for the horizontal rails (Overview carousels, the outfits row). A page is one viewport
// width of scroll; the caller owns the DOM, this owns the arithmetic.

/** How many viewport-wide pages a rail's scroll extent covers — always at least one. */
export function railPageCount(scrollWidth: number, clientWidth: number): number {
  if (clientWidth <= 0) return 1
  return Math.max(1, Math.ceil((scrollWidth - clientWidth) / clientWidth) + 1)
}

/**
 * Which page a scroll offset sits on. Mapped over the SCROLLABLE EXTENT rather than by dividing the
 * offset by the viewport width: the last page is usually a partial viewport (N cards per view leaves
 * a remainder), so the browser clamps the scroll short of `page * width` and dividing would report a
 * page that can never be the last one — leaving the end arrow forever enabled and the end dot dead.
 */
export function railPageFromScroll(scrollLeft: number, scrollWidth: number, clientWidth: number): number {
  const pages = railPageCount(scrollWidth, clientWidth)
  const max = scrollWidth - clientWidth
  if (pages <= 1 || max <= 0) return 0
  const ratio = Math.min(1, Math.max(0, scrollLeft / max))
  return Math.round(ratio * (pages - 1))
}
