import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CollectionThumb } from '~/components/CollectionThumb'

const { colors, radius, media } = theme

const hover = '#f5f4f7'

// The keyboard's row looks like the hovered one, plus a ring: hover alone would leave a keyboard user with
// no way to tell where they are once the pointer rests on another row.
const active = `
  &[data-active] {
    background: ${hover};
    box-shadow: inset 0 0 0 2px ${colors.accent};
  }
`

// Anchored to the search box (NavBar's Search wrapper is position: relative), left-aligned under the
// input. Three sections can stack tall, so the whole panel caps its height and scrolls as one.
export const Pop = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 60;
  background: ${colors.white};
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  box-shadow: 0 14px 36px rgba(20, 20, 30, 0.18);
  padding: 8px;
  animation: cart-pop-in 0.16s ease;
  max-height: min(70vh, 560px);
  overflow-y: auto;

  /* On mobile the search field shrinks, so pin the right edge to the input and grow leftward to span
     the viewport minus small gutters (an anchored left/right: 0 panel would render very narrow). */
  ${media.maxWidth('mobile')} {
    left: auto;
    right: 0;
    width: calc(100vw - 24px);
    max-height: min(70vh, 480px);

    /**
     * The iOS web view anchors the other way round.
     *
     * That rule above grows the panel LEFTWARD from the field's right edge, which works on the web because
     * the field has its own full-width row and its right edge is already at the viewport's. In the web view
     * the field is 196px and sits at the START of the top row (see NavBar Search [data-iap]), so its right
     * edge is mid-screen — and a panel a whole viewport wide grown leftward from there hangs 155px off the
     * left of the screen, clipped, which is what this fixes.
     *
     * So: anchor to the field's LEFT edge and grow right instead. The field starts at the row's own 16px
     * padding, so subtracting 32px of gutter leaves the panel sitting 16px from each edge — the same inset
     * on both sides, at every width, without needing to know where the field is.
     */
    &[data-iap] {
      left: 0;
      right: auto;
      width: calc(100vw - 32px);
    }
  }
`

// The listbox proper: its options live in groups; it has no chrome of its own.
export const Listbox = styled.div`
  display: block;
`

export const Group = styled.div`
  display: block;
`

// Recent searches beside their removal controls: the options on the left, the × buttons on the right,
// row for row — the buttons are not options, so they cannot live inside the listbox.
export const RecentArea = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
`

export const RemoveList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;

  & li {
    height: 40px;
    display: flex;
    align-items: center;
  }
`

// The popular searches, as chips that wrap.
export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 10px 10px;
`

export const Chip = styled.button`
  height: 36px;
  padding: 0 14px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.pill};
  background: ${colors.white};
  color: ${colors.text};
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: ${hover};
  }
  ${active}
`

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${colors.muted};
`

export const Clear = styled.button`
  background: none;
  border: 0;
  color: ${colors.accent};
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
`

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`

export const Row = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  background: none;
  border: 0;
  padding: 8px 10px;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${hover};
  }
  ${active}
`

// `data-variant`: round (creator avatar) / icon (neutral collection fallback tile).
export const Thumb = styled.span`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: ${colors.media};
  overflow: hidden;

  & img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &[data-variant='round'] {
    border-radius: 50%;
  }
  &[data-variant='round'] img {
    border-radius: 50%;
  }
  &[data-variant='icon'] {
    display: grid;
    place-items: center;
  }
  &[data-variant='icon'] .ico {
    width: 18px;
    height: 18px;
    color: ${colors.muted};
  }
`

// The shared collection mosaic sized as a 40px rounded tile.
export const CollThumb = styled(CollectionThumb)`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex: none;
`

export const Text = styled.span`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
`

export const Name = styled.span`
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  /* What the query matched: weight, not a highlighter, so the row's own colours stay as they are. */
  & mark {
    background: none;
    color: inherit;
    font-weight: 700;
  }
`

export const Sub = styled.span`
  min-width: 0;
  font-size: 12px;
  color: ${colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * Pinned to the bottom of the panel rather than sitting after the last result.
 *
 * The panel scrolls (see Pop), and this used to scroll with it — so on a query with many matches the one
 * control that reaches the full result set was below the fold of a dropdown most people never scroll.
 * `sticky` keeps it in flow (no height reserved when the list is short) while holding the bottom edge
 * once the list overflows. The background has to be opaque, since rows pass underneath it, and has to be
 * the same one Pop uses — the two are a single visual surface, so they change together.
 *
 * The negative bottom margin cancels Pop's padding so the bar meets the panel edge instead of leaving an
 * 8px strip of scrolling content below it, and the matching padding keeps the label where it was.
 */
export const SeeAll = styled.button`
  position: sticky;
  bottom: -8px;
  z-index: 1;
  width: 100%;
  margin-top: 4px;
  margin-bottom: -8px;
  padding: 10px 10px 18px;
  border: 0;
  border-top: 1px solid ${colors.line};
  background: ${colors.white};
  color: ${colors.accent};
  font-weight: 700;
  font-size: 13px;
  text-align: center;
  cursor: pointer;

  &:hover {
    background: ${hover};
  }
  ${active}
`

export const Empty = styled.p`
  padding: 16px 10px;
  color: ${colors.muted};
  font-size: 14px;
  text-align: center;
`

export const RecentBtn = styled.button`
  width: 100%;
  min-width: 0;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: 0;
  padding: 0 10px;
  border-radius: 10px;
  text-align: left;
  font-size: 14px;
  color: ${colors.text};
  cursor: pointer;
  overflow: hidden;

  &:hover {
    background: ${hover};
  }
  ${active}
`

export const RecentText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

// Visually hidden, read by screen readers: how many suggestions the last answer holds.
export const Live = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`

export const RecentRemove = styled.button`
  background: none;
  border: 0;
  color: ${colors.muted};
  font-size: 16px;
  line-height: 1;
  padding: 6px 10px;
  cursor: pointer;

  &:hover {
    color: ${colors.text};
  }
`

// A rarity facet's mark: its colour, nothing else.
export const RarityDot = styled.span`
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
`
