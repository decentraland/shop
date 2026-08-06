// Paging math for the horizontal rails (Overview carousels, the outfits row). The geometry is measured
// off the actual cards rather than the viewport width, because under mandatory snap only a card start
// is a scroll target the browser honours.

/**
 * The rail's geometry, measured off the cards. A page of cards spans slightly less than the viewport
 * (the gap between two cards falls outside it), and under mandatory snap only a card start is a scroll
 * target the browser honours — so a rail whose card count is not a multiple of its per-view count
 * cannot page by viewport widths without drifting off the page it thinks it is on.
 */
export type RailGeometry = { cards: HTMLElement[]; stride: number; perView: number; pageCount: number; base: number }

export function railGeometry(el: HTMLElement): RailGeometry | null {
  // Narrowed rather than cast: `children` is typed as Element, and offsetLeft belongs to HTMLElement.
  const cards = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
  if (cards.length === 0 || el.clientWidth <= 0) return null
  const stride = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth
  if (stride <= 0) return null
  const perView = Math.max(1, Math.round(el.clientWidth / stride))
  return {
    cards,
    stride,
    perView,
    pageCount: Math.max(1, Math.ceil(cards.length / perView)),
    base: cards[0].offsetLeft
  }
}

/** Which page the rail is actually showing. */
export function railPageFromGeometry(el: HTMLElement, g: RailGeometry): number {
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return 0
  // The last page is partial, so the rail rests past its start; anchor the end or it never reads as
  // current. 2px of slack because scrollLeft is fractional and rounds off under zoom.
  if (el.scrollLeft >= maxScroll - 2) return g.pageCount - 1
  return Math.min(g.pageCount - 1, Math.round(el.scrollLeft / (g.perView * g.stride)))
}

/**
 * Scroll to the start of a card, never to a multiple of the viewport width: under mandatory snap the
 * browser overrides any other target, which desynchronises the rail from the page it reports.
 */
export function scrollRailToPage(el: HTMLElement, g: RailGeometry, page: number): void {
  const target = Math.max(0, Math.min(g.pageCount - 1, page))
  const card = g.cards[Math.min(target * g.perView, g.cards.length - 1)]
  el.scrollTo({ left: card.offsetLeft - g.base, behavior: 'smooth' })
}
