import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { Dropdown } from '~/components/Dropdown'
import { Icon } from '~/components/Icon'
import { SaleTag } from '~/components/SaleTag'
import { SaleTimer } from '~/components/SaleTimer'
import { theme } from '~/styles/theme'

// The seller's dashboard. White panels on the Shop's purple field, the same surface My Creations uses, so
// the two read as one place rather than two products.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;

  /* The credits mark is pinned near-black globally (Icon.css) so a coloured total never tints it. Every
     surface on this page is dark, so the whole page opts out once rather than each panel in turn. */
  .ccy-mark,
  .ccy {
    color: ${theme.colors.softWhite};
  }

  /* MANA's mark is an image, not a masked glyph, so no colour reaches it: the token's own artwork is dark
     and vanished into every panel on this page. Driven to white instead. */
  [data-kind='mana'] img {
    filter: brightness(0) invert(1);
  }
`

export const Masthead = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  /* The rule that closes the identity block off from the figures under it. */
  padding-bottom: 24px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.3);
`

export const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`

/** The three lines beside the avatar: who you are, whose store this is, and what is in it. */
export const IdentityText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding-bottom: 8px;
  min-width: 0;
`

/** The creator's own face, so the page opens on whose store it is. */
export const Avatar = styled.span`
  flex: none;
  display: block;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.22);
  background-size: cover;
  background-position: center top;
  border: 2px solid rgba(252, 252, 252, 0.22);

  ${theme.media.maxWidth('mobile')} {
    width: 56px;
    height: 56px;
  }
`

/** Who is signed in, above the store's own name. */
export const Eyebrow = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  color: ${theme.colors.softWhite};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
`

export const Title = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.46px;
  color: ${theme.colors.white};

  ${theme.media.maxWidth('mobile')} {
    font-size: 26px;
  }
`

/** The title and the line under it, which the design keeps 8px apart. */
export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
`

export const Sub = styled.p`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1;
  color: ${theme.colors.softWhite};
`

export const StoreActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;

  /* Two uppercase buttons that cannot shrink below their labels. On a phone they fit side by side in
     Inter with a few pixels to spare, and in any wider fallback font they did not: the second one ran
     15px off a 390px screen. Wrapping puts it on its own line instead. */
  ${theme.media.maxWidth('mobile')} {
    justify-content: flex-start;
    width: 100%;
  }
`

/** The way out to the page a shopper sees, which is the only view a creator cannot get to from here. */
export const ViewPublic = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 12px;
  border-radius: ${theme.radius.card};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: underline;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.navViolet};
  }
  .ico {
    width: 22px;
    height: 22px;
  }

  ${theme.media.maxWidth('mobile')} {
    padding: 0 8px;
  }
`

export const EditStore = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 24px;
  border-radius: ${theme.radius.card};
  background: ${theme.colors.overlay};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s ease;

  &:hover {
    background: ${theme.colors.overlayHover};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
  .ico {
    width: 20px;
    height: 20px;
  }

  ${theme.media.maxWidth('mobile')} {
    padding: 0 16px;
  }
`

/**
 * The creator's own social links, appended to the summary line.
 *
 * The rule on the left is the design's divider: the row is a continuation of the line it follows, not a
 * block of its own, so it only makes sense with something before it.
 */
export const Socials = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
`

export const Social = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.softWhite};
  transition: color 0.15s ease;

  &:hover {
    color: ${theme.colors.navViolet};
  }
  .ico {
    width: 15px;
    height: 15px;
  }
`

/**
 * The band that names the figures below it and carries the window they are measured over.
 *
 * The period selector used to sit up in the masthead beside the store's own actions, which put a control
 * that changes every number on the page in the same row as two links that change nothing.
 */
export const PerfHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`

export const PerfTitle = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: ${theme.colors.white};
`

export const Periods = styled.div`
  display: flex;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  border-radius: ${theme.radius.pill};
  background: rgba(0, 0, 0, 0.22);
  /* Six presets outgrow a phone: the row scrolls rather than wrapping into a second pill. */
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`

/** Anchors the range picker under the period row, outside its scroller so the popup is not clipped. */
export const PeriodsWrap = styled.div`
  position: relative;
  max-width: 100%;
`

export const Period = styled.button`
  flex: none;
  white-space: nowrap;
  border: 0;
  cursor: pointer;
  font-family: ${theme.font.sans};
  padding: 7px 15px;
  border-radius: ${theme.radius.pill};
  font-size: 13px;
  font-weight: 600;
  color: rgba(252, 252, 252, 0.62);
  background: transparent;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover {
    color: ${theme.colors.softWhite};
  }
  &[aria-pressed='true'] {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const Tiles = styled.section`
  display: grid;
  /* Five tiles when the store has resales to report, four when it does not — auto-fit rather than a fixed
     count so neither case leaves a hole. */
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const Tile = styled.div`
  background: ${theme.colors.overlay};
  color: ${theme.colors.softWhite};
  border-radius: ${theme.radius.modal};
  padding: 12px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  /* The credits mark is pinned near-black globally (Icon.css) so a coloured total never tints it. That
     was chosen for a white card and disappears into this one. */
  .ccy-mark,
  .ccy {
    color: ${theme.colors.softWhite};
  }
`

export const TileKey = styled.span`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  /* The tiles carrying a tooltip button stand 3px taller than the rest, and in a grid that is 3px of dead
     space under every other card. Held to the taller of the two. */
  min-height: 18px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${theme.colors.gray4};
`

export const TileMark = styled.span`
  /* Ahead of the label, as the design has it. Ordered rather than moved in the markup, because the mark is
     the last child in every tile and reordering five sets of markup would buy nothing. */
  order: -1;
  font-size: 16px;
  line-height: 1;
  filter: saturate(0.9);
`

export const TileValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;

  /* The currency mark is a box, not a glyph with a baseline: sized to the digits' cap height and centred
     against them, rather than left to sit on the line's bottom edge. */
  [data-kind] {
    align-self: center;
    margin-right: 6px;
  }
  [data-kind] img,
  [data-kind] .ico {
    width: 0.74em;
    height: 0.74em;
    vertical-align: baseline;
  }
  font-family: ${theme.font.sans};
  font-size: 32px;
  font-weight: 600;
  line-height: 1.235;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`

/** Marks a figure the Shop can only approximate, without shouting about it. */
export const Approx = styled.span`
  font-size: 20px;
  font-weight: 600;
  color: ${theme.colors.gray4};
  margin-right: -2px;
`

export const TileUnit = styled.span`
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  color: ${theme.colors.gray4};
`

/**
 * The line under a tile's figure.
 *
 * The tiles are grid cells, so the tallest one sets the height of the row. Reserving a second line for
 * every card fixed that and left dead space under most of them instead; the copy is kept short enough to
 * fit one line at the tile's own width, which fixes it without spending the pixels.
 */
export const TileFoot = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  min-width: 0;
  min-height: 16px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1.35;
  color: ${theme.colors.gray4};
`

/**
 * The seam on a figure the Shop can only approximate.
 *
 * Earnings is a sum over rows the feed returns a page at a time, so past the cap it covers part of the
 * window. A dashboard that cannot tell what it knows from what it estimates is worse than one with fewer
 * figures, so the estimate says so rather than passing as exact.
 */
export const Estimate = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${theme.colors.gray4};
  border: 1px dashed ${theme.colors.cardLine};
  border-radius: ${theme.radius.chip};
  padding: 1px 5px;
`

export const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${theme.colors.overlayLight};
  color: ${theme.colors.softWhite};
  border-radius: ${theme.radius.banner};
  min-width: 0;
  /* The credits mark is pinned near-black globally (Icon.css) so a coloured total never tints it. That
     was chosen for a white card and disappears into this one. */
  .ccy-mark,
  .ccy {
    color: ${theme.colors.softWhite};
  }
`

export const PanelHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`

export const PanelTitle = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`

export const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

/**
 * The shop's own dropdown, re-inked for a white panel.
 *
 * Its trigger is drawn for the purple field — a translucent black fill with near-white text — which on
 * this surface reads as a disabled control. Same shape, panel colours.
 */
/**
 * The sort control, inked for a dark panel like every other control in this table.
 *
 * It used to be a white pill, which hover turned translucent while the label stayed near-black: the
 * control went dark and its text went with it. Transparent with a hairline is the same language the
 * pager and the row action speak, and hover only deepens the fill.
 */
export const Sort = styled(Dropdown)`
  /* Direct child only: the menu's options are buttons as well, and a descendant rule turned them white
     on the white menu, which is a menu you cannot read. */
  > button {
    gap: 24px;
    height: 40px;
    padding: 4px 4px 4px 12px;
    background: transparent;
    border: 0.5px solid ${theme.colors.white};
    border-radius: ${theme.radius.btn};
    color: ${theme.colors.white};
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  > button:hover {
    border-color: ${theme.colors.softWhite};
    background: ${theme.colors.glassFaint};
    color: ${theme.colors.softWhite};
  }
  /* The chevron's colour is an inline style on the shared component, so a class cannot reach it — this
     is the one place that has to shout. */
  > button .ico {
    color: ${theme.colors.softWhite} !important;
  }
`

export const PanelHint = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.gray4};
`

/**
 * The row's tracks, shared by the column header so the two cannot drift apart.
 *
 * Sized so the column centres sit at roughly even distances. The discount is the widest because it holds
 * two chips side by side; everything else is close to equal.
 */
const COLLECTION_TRACKS =
  '24px 56px minmax(170px, 1fr) minmax(236px, 1.34fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(150px, 1fr) 158px'

/**
 * The band naming the columns, darker than the rows under it.
 *
 * The design's three washes are all the Shop's own: 0.2 for the shell, 0.6 here, 0.4 for a row. The
 * header being the darkest is what separates the labels from the data without a rule between them.
 */
export const ColHead = styled.div`
  display: grid;
  grid-template-columns: ${COLLECTION_TRACKS};
  align-items: center;
  gap: 12px;
  padding: 12px 24px 12px 12px;
  min-width: min-content;
  background: ${theme.colors.overlayStrong};
  border-radius: ${theme.radius.card} ${theme.radius.card} 0 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.softWhite};

  /* Each label sits the way its column's content sits, so a header never points at the wrong figure. */
  > *:nth-child(4),
  > *:nth-child(5),
  > *:nth-child(6),
  > *:nth-child(7) {
    text-align: center;
  }
  /* The label sits over the middle of the action, not over its right edge: in the design both occupy the
     same box, so the header stretches across the track and centres inside it. */
  > *:last-child {
    justify-self: stretch;
    text-align: center;
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

/**
 * The rows as their own blocks rather than one slab divided by hairlines.
 *
 * The design separates them with 2px of the panel's own wash showing through, and rounds only the ends of
 * the run, so the header and the last row close the shape between them.
 */
export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  /*
   * The run scrolls sideways rather than crushing its own columns.
   *
   * The tracks need 1158px before the grid starts taking room from them, and the panel used to clip what
   * did not fit. It does not any more, and a clipped row is worse than a scrolling one: the action is the
   * last column, so on a 1024px tablet "Manage" simply left the screen with no way to reach it.
   */
  overflow-x: auto;

  > *:last-child {
    border-radius: 0 0 ${theme.radius.card} ${theme.radius.card};
  }
`

export const CollRow = styled.div`
  display: grid;
  grid-template-columns: ${COLLECTION_TRACKS};
  align-items: center;
  gap: 12px;
  padding: 12px 24px 12px 12px;
  min-width: min-content;
  background: ${theme.colors.overlay};

  /* A fixed track keeps every row's action in the same place, centred under its column's label. */
  > *:last-child {
    justify-self: center;
  }

  /**
   * A collection with no copies left, set back from the ones that still have something to sell.
   *
   * Muted rather than faded: opacity would take the row's one action down with it, and a creator who wants
   * to look at a finished run should not have to fight the styling to click into it. The thumbnail loses
   * its colour, the figures lose their weight, and the row still reads.
   */
  &[data-exhausted] {
    background: rgba(0, 0, 0, 0.55);
    color: ${theme.colors.gray4};

    [data-testid='store-collection-thumb'] img {
      filter: grayscale(0.75);
      opacity: 0.72;
    }
    /* The collection's own name follows the row; the action at the end keeps its colour, because a
       finished run is still one a creator opens, and a button that reads disabled invites nobody. */
    [data-testid='store-collection-name'] {
      color: inherit;
    }
  }

  /**
   * On a phone the seven columns become two rows: identity and figure on the first, the discount and the
   * action on the second. Placed explicitly rather than left to auto-flow, which dropped both of them
   * into the first two narrow tracks on top of each other.
   */
  /*
   * Three lines on a phone: who it is and what to do about it, then the two figures, then the discount.
   *
   * Every cell is placed explicitly rather than left to auto-flow, because the columns changed order once
   * already and an auto-placed grid answers that by putting a sparkline where a button used to be.
   */
  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: 24px 56px minmax(0, 1fr) auto;
    row-gap: 12px;

    > *:nth-child(1) {
      grid-area: 1 / 1;
    }
    > *:nth-child(2) {
      grid-area: 1 / 2;
    }
    /* The name takes the whole of its line. Sharing it with the action left "Founders Edition" as an
       ellipsis and a chip, which is the one cell on the row that has to be readable. */
    > *:nth-child(3) {
      grid-area: 1 / 3 / 1 / 5;
    }
    > *:nth-child(5) {
      grid-area: 2 / 1 / 2 / 3;
      justify-self: start;
    }
    > *:nth-child(6) {
      grid-area: 2 / 3;
      justify-self: start;
    }
    > *:nth-child(8) {
      grid-area: 2 / 4;
      justify-self: end;
    }
    > *:nth-child(4) {
      grid-area: 3 / 1 / 3 / 5;
      justify-self: start;
      align-items: flex-start;
      text-align: left;
    }
  }
`

/** The disclosure control. A button, not a decoration: it is what opens the per-item breakdown. */
export const Chevron = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${theme.radius.btn};
  background: none;
  cursor: pointer;
  color: ${theme.colors.gray4};

  &:hover {
    background: ${theme.colors.glassFaint};
    color: ${theme.colors.softWhite};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.navViolet};
    outline-offset: 2px;
  }

  /* A finger needs more than the 24px the glyph occupies, and the row has that much clear space around it. */
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
  }

  .ico {
    width: 16px;
    height: 16px;
    transition: transform 0.18s ease;
  }
  &[aria-expanded='true'] .ico {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .ico {
      transition: none;
    }
  }
`

export const Mosaic = styled.span`
  width: 56px;
  height: 56px;
  border-radius: ${theme.radius.btn};
  overflow: hidden;
  background: ${theme.colors.overlayLight};
`

/**
 * A finished run, beside the collection's name.
 *
 * A chip rather than another clause in the grey line under it: "sold out" is the one fact on the row that
 * changes how its zero should be read, and buried in a run-on of counts it read as one more count.
 */
export const SoldOutChip = styled.span`
  flex: none;
  display: inline-flex;
  align-items: center;
  font-family: ${theme.font.sans};
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: ${theme.radius.pill};
  color: ${theme.colors.gray4};
  background: ${theme.colors.glassFaint};
`

export const NameLine = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;

  /*
   * The chip yields before the name does, which is the opposite of what it used to do.
   *
   * With a wide name column the name could ellipsise and keep "sold out" beside it. The columns are even
   * now, so that column is 176px, and yielding the name first left "Founders Ed…" next to a chip: the row
   * lost the one thing it has to say to save the one thing that repeats on every sold-out row.
   */
  a {
    min-width: 0;
    flex: 0 1 auto;
  }
`

export const CollName = styled.span`
  min-width: 0;

  a {
    display: block;
    color: inherit;
    text-decoration: none;
    font-family: ${theme.font.sans};
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a:hover,
  a:focus-visible {
    text-decoration: underline;
  }
`

/**
 * The counts under a collection's name.
 *
 * Its own component rather than a bare `span` rule on the parent: that rule reached every span inside the
 * cell, which turned the name line's flex into a block and stretched the sold-out chip across the row.
 */
export const CollMeta = styled.span`
  display: block;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.gray4};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Num = styled.span`
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;

  small {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: ${theme.colors.gray4};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const SparkCell = styled.span`
  min-width: 0;

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const Spark = styled.svg`
  display: block;
  width: 100%;
  height: 34px;
`

export const Items = styled.div`
  /* A shade deeper than the row it belongs to, not lighter. The rows carry their own dark fill now, and a
     translucent white panel between them read as a different surface breaking the run in half. */
  background: ${theme.colors.overlayStrong};
  padding: 4px 24px 10px 48px;

  ${theme.media.maxWidth('mobile')} {
    padding-left: 32px;
  }
`

/** What the collection itself did, at the head of its own breakdown. */
export const CollStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 26px;
  padding: 12px 0 13px;
  border-bottom: 1px solid ${theme.colors.cardLine};

  span {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-family: ${theme.font.sans};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${theme.colors.gray4};
  }
  b {
    /* The currency mark is its own inline-flex element, so the figure needs a row of its own or the two
       break onto separate lines. */
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: ${theme.colors.softWhite};
    font-variant-numeric: tabular-nums;
  }
`

export const ItemRow = styled.div`
  display: grid;
  /* The stock track is fixed rather than max-content: each row is its own grid, so a content-sized last
     track let every row measure itself and none of them lined up. 124px clears the widest figure the page
     renders (105px) with room to spare, without leaving a hand's width between the bar and the number. */
  grid-template-columns: 40px minmax(0, 1fr) 72px 64px 152px 124px;
  align-items: center;
  gap: 22px;
  padding: 13px 0;

  > *:last-child {
    justify-self: end;
  }

  & + & {
    border-top: 1px solid ${theme.colors.cardLine};
  }

  /*
   * Two lines on a phone: the item, then its figures under the name.
   *
   * Placed explicitly. With three tracks and six cells the browser auto-flowed the stock figure into the
   * 40px thumbnail track on the second row, where justify-self: end right-aligned 105px of text inside
   * 40px of column and pushed its left edge a pixel off the card.
   */
  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: 40px minmax(0, 1fr) auto;
    column-gap: 12px;
    row-gap: 8px;

    > *:nth-child(3) {
      grid-area: 2 / 2;
      justify-self: start;
    }
    > *:last-child {
      grid-area: 2 / 3;
      justify-self: end;
    }
  }
`

/** The item's own thumbnail over its rarity wash — the same treatment its card gets in the grid. */
export const ItemThumb = styled.span`
  display: block;
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  overflow: hidden;
  /* The rarity wash is a gradient of ALPHAS, drawn for a white card. Composited over a dark panel instead
     it turns muddy, so the base it was measured against is put back under it. */
  background-color: ${theme.colors.white};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const ItemCell = styled.span`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const ItemMeta = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
`

/** Padded past its text and pulled back by the same margin, so it is tappable without growing the row. */
export const IssueBtn = styled.button`
  flex: none;
  margin: -8px 0;
  padding: 8px 4px;
  border: 0;
  background: none;
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: ${theme.colors.navViolet};
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
    border-radius: 4px;
  }
`

/** The item's rarity, stated the way its card states it — same palette, same wording. */
export const RarityChip = styled.span`
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 15px;
  padding: 0 6px;
  border-radius: 5px;
  font-family: ${theme.font.sans};
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${theme.colors.softWhite};
`

export const ItemName = styled(Link)`
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

export const ItemNum = styled.span`
  font-family: ${theme.font.sans};
  font-size: 13px;
  white-space: nowrap;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: ${theme.colors.softWhite};

  small {
    color: ${theme.colors.gray4};
    font-weight: 500;
  }

  ${theme.media.maxWidth('mobile')} {
    text-align: left;
  }
`

/**
 * How much of an item's run is gone, at a glance.
 *
 * Deliberately not the offer bar from the item page: that one measures a discount's allowance, this one
 * measures the mint. Same visual family, different quantity — so it is drawn thinner and in the muted ink
 * rather than the sale red, which belongs to the discount.
 */
export const Run = styled.span`
  display: block;
  width: 96px;
  height: 6px;
  border-radius: 100px;
  /* White, not the near-black this started as: the track was a 10% dark fill chosen for a white card, and
     on the row's own dark surface it was the same colour as the row. */
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  /* Pushed to the end of its track, so it sits with the stock figure it measures rather than crowding the
     saves count next to it. */
  margin-left: auto;

  i {
    display: block;
    height: 6px;
    border-radius: 100px;
    background: ${theme.colors.navViolet};
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const ItemState = styled.span`
  font-family: ${theme.font.sans};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${theme.colors.gray4};

  &[data-state='soldout'] {
    color: ${theme.colors.navViolet};
  }
  /* A listed item shows its price rather than a label, so it takes the ink prices take. */
  &[data-state='classic'],
  &[data-state='discounted'] {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    letter-spacing: 0;
    text-transform: none;
    color: ${theme.colors.softWhite};
  }
`

export const StockCell = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  line-height: 1.25;
`

/** The label before a listed item's price, so the number is not a bare figure in a column of counts. */
export const OnSaleFor = styled.span`
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${theme.colors.gray4};
  margin-right: 4px;
`

/** Copies that exist without a sale behind them — sent, not bought. */
export const Issued = styled.span`
  font-family: ${theme.font.sans};
  font-size: 10px;
  opacity: 0.85;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${theme.colors.gray4};
`

/** Copies left against the whole run — always shown, because "9 left" of what is not an answer. */
export const Stock = styled.span`
  font-family: ${theme.font.sans};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  text-align: right;
  color: ${theme.colors.gray4};
  font-variant-numeric: tabular-nums;

  b {
    color: ${theme.colors.softWhite};
    font-weight: 700;
  }
  &[data-out='true'] {
    color: ${theme.colors.navViolet};
  }
`

export const AttnRow = styled.div`
  display: grid;
  grid-template-columns: 3px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 13px 18px;
  border-top: 1px solid ${theme.colors.cardLine};
`

export const Stripe = styled.span`
  align-self: stretch;
  border-radius: 2px;
  background: ${theme.colors.cardLine};

  &[data-sev='act'] {
    background: ${theme.colors.dclRed};
  }
  &[data-sev='soon'] {
    background: ${theme.colors.flareAmber};
  }
`

/** The mark that carries a row's explanation, beside its title rather than under it. */
export const Info = styled.button`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: 5px;
  padding: 0;
  border: 0;
  background: none;
  cursor: help;
  color: ${theme.colors.gray4};

  &:hover,
  &:focus-visible {
    color: ${theme.colors.softWhite};
  }
  .ico {
    width: 14px;
    height: 14px;
  }
`

export const AttnText = styled.span`
  b {
    display: flex;
    align-items: center;
    font-family: ${theme.font.sans};
    font-size: 13px;
    font-weight: 600;
  }
  span {
    display: block;
    margin-top: 2px;
    font-family: ${theme.font.sans};
    font-size: 12px;
    color: ${theme.colors.gray4};
  }
`

/** The row's way out: where the creator goes to do something about it. */
export const AttnLink = styled(Link)`
  display: inline-block;
  margin-top: 4px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.navViolet};
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

export const AttnNum = styled.span`
  font-family: ${theme.font.sans};
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`

export const FeedWrap = styled.div`
  overflow-x: auto;
`

export const Feed = styled.table`
  width: 100%;
  /* Fixed, so a page of short names and one of long ones lay their columns out identically — the widths
     come from the header row rather than from whatever this page happens to hold. */
  table-layout: fixed;

  thead th:nth-of-type(1) {
    width: 36%;
  }
  thead th:nth-of-type(2) {
    width: 24%;
  }
  thead th:nth-of-type(3) {
    width: 120px;
  }
  thead th:nth-of-type(4) {
    width: 14%;
  }
  thead th:nth-of-type(5) {
    width: 110px;
  }
  tbody td {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  font-family: ${theme.font.sans};
  font-size: 13px;
  min-width: 520px;

  /* The same band and the same separated rows the collections table wears, so the three tables on this
     page read as siblings rather than as one design and two others. The 2px gap is a transparent border
     over a clipped background, which is how a table draws the design's gaps without losing its columns. */
  border-collapse: separate;
  border-spacing: 0;

  thead th {
    text-align: left;
    padding: 12px 18px;
    background: ${theme.colors.overlayStrong};
    font-size: 14px;
    font-weight: 400;
    color: ${theme.colors.softWhite};
    white-space: nowrap;
  }
  thead th:first-of-type {
    border-radius: ${theme.radius.card} 0 0 0;
  }
  thead th:last-of-type {
    border-radius: 0 ${theme.radius.card} 0 0;
  }
  tbody td {
    padding: 12px 18px;
    background: ${theme.colors.overlay};
    border-top: 2px solid transparent;
    background-clip: padding-box;
    vertical-align: middle;
  }
  tbody tr:last-of-type td:first-of-type {
    border-radius: 0 0 0 ${theme.radius.card};
  }
  tbody tr:last-of-type td:last-of-type {
    border-radius: 0 0 ${theme.radius.card} 0;
  }
  tbody tr:hover td {
    background: ${theme.colors.overlayHover};
  }
  td[data-money] {
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  td[data-dim] {
    color: ${theme.colors.gray4};
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`

export const SaleItem = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &:hover span,
  &:focus-visible span {
    text-decoration: underline;
  }
`

export const SaleThumb = styled.span`
  flex: none;
  display: block;
  width: 32px;
  height: 32px;
  border-radius: ${theme.radius.chip};
  overflow: hidden;
  /* Same rarity wash, same reason it needs a white base under it — see ItemThumb. */
  background-color: ${theme.colors.white};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

/** Who bought, as their profile: face and display name, opening their page in its own tab. */
export const Buyer = styled.a`
  max-width: 100%;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

/** Holds the buyer line's place while the profile resolves, so the name is written once. */
export const FaceSkeleton = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;

  i {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #ededed;
  }
  b {
    display: block;
    width: 84px;
    height: 10px;
    border-radius: 100px;
    background: #ededed;
  }
`

export const Face = styled.span`
  flex: none;
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${theme.colors.overlayLight};
  background-size: cover;
  background-position: center top;
`

export const Pager = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  font-variant-numeric: tabular-nums;
`

const pageControl = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0.5px solid rgba(255, 255, 255, 0.5);
  border-radius: ${theme.radius.btn};
  background: transparent;
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.46px;
  color: ${theme.colors.softWhite};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${theme.colors.softWhite};
    background: ${theme.colors.glassFaint};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`

export const PageBtn = styled.button`
  ${pageControl}
`

/** The page you are on wears the shop's purple; the rest are plain. */
export const PageNum = styled.button`
  ${pageControl}

  /* The page you are on is the one solid control in the row, which is how the design marks it. */
  &[aria-current='page'] {
    background: ${theme.colors.softWhite};
    border-color: ${theme.colors.softWhite};
    color: ${theme.colors.text};
    cursor: default;
  }
  &[aria-current='page']:hover {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text};
  }
`

export const PageGap = styled.span`
  padding: 0 2px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.gray4};
`

/** A column header that carries its own explanation. */
export const HeadWithHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
`

export const Kind = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: ${theme.radius.chip};
  padding: 2px 7px;
  white-space: nowrap;
  color: ${theme.colors.gray4};
  background: ${theme.colors.overlayLight};

  &[data-kind='mint'] {
    color: ${theme.colors.navViolet};
    background: rgba(105, 31, 169, 0.1);
  }
`

export const ManaMark = styled.img`
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  margin-right: 3px;
`

export const More = styled.button`
  display: block;
  width: 100%;
  padding: 13px 18px;
  border: 0;
  border-top: 1px solid ${theme.colors.cardLine};
  background: none;
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.navViolet};

  &:hover {
    background: ${theme.colors.glassFaint};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.navViolet};
    outline-offset: -2px;
  }
`

/** A line of context under a panel's rows — why they do not add up, or what could not be read. */
/**
 * A footnote under a list, not another row of it.
 *
 * Each of these used to carry its own top border and full row padding, which made two asides read as two
 * more entries in the table above them. They share one hairline and sit indented under the count instead.
 */
export const Notes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 18px 14px;
  border-top: 1px solid ${theme.colors.cardLine};
`

export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 11px;
  line-height: 1.45;
  color: ${theme.colors.muted2};
`

/**
 * One bar of the loading state.
 *
 * The skeleton is built from the REAL containers — the same tiles, panels and rows the figures land in —
 * with these standing in for the text, so the layout cannot shift when the data arrives. `.skeleton` is
 * the shared shimmer from index.css.
 */
// The shared stops, like every other skeleton in the Shop. These used to be opaque light greys because
// the panels behind them were white; now that they are not, opaque bars read as blocks punched into the
// page — which is the exact thing `--skeleton-lo/hi` exists to avoid.
const shimmerFill = `
  background: linear-gradient(100deg, var(--skeleton-lo) 30%, var(--skeleton-hi) 50%, var(--skeleton-lo) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const Bar = styled.span`
  display: block;
  height: 12px;
  border-radius: 100px;
  ${shimmerFill}
`

export const Dot = styled.span`
  display: block;
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  ${shimmerFill}
`

/** The table's header row while it loads, on the same grid as the rows below it. */
export const FeedHeadBone = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) 100px minmax(0, 0.5fr) 70px;
  align-items: center;
  gap: 12px;
  padding: 0 18px 10px;

  > *:last-child {
    justify-self: end;
  }
  background: ${theme.colors.overlayStrong};
  border-radius: ${theme.radius.card} ${theme.radius.card} 0 0;
`

/** A row of the loading feed, on the table's own column rhythm. */
export const FeedBone = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) 100px minmax(0, 0.5fr) 70px;
  align-items: center;
  gap: 12px;
  height: 57px;
  padding: 0 18px;
  background: ${theme.colors.overlay};
  border-top: 2px solid transparent;
  background-clip: padding-box;

  > *:last-child {
    justify-self: end;
  }
`

export const Empty = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.gray4};
`

export const ChevronIcon = styled(Icon)`
  width: 16px;
  height: 16px;
`

/**
 * How a figure moved against the window before it.
 *
 * Colour alone would carry the whole meaning, so the arrow carries it too: a reader who cannot separate
 * the green from the red still sees which way it points.
 */
/**
 * The movement, on the tile's bottom line: an arrow, the percentage in its colour, and what it is measured
 * against in grey. The window is spelled out rather than left in a tooltip, because a bare "50%" on a
 * dashboard invites the reader to supply their own period.
 */
export const Delta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  flex-wrap: wrap;
  color: ${theme.colors.gray4};

  &[data-dir='up'] {
    color: ${theme.colors.successBorder};
  }
  &[data-dir='down'] {
    color: #ff6b6b;
  }

  /* Grey whichever way the figure went: it is the label, not the reading. */
  .delta__against {
    font-size: 10px;
    font-weight: 400;
    color: ${theme.colors.gray4};
  }
  .delta__arrow {
    font-size: 10px;
    line-height: 1;
  }
`

/**
 * The heading over a band of panels, on the purple field rather than inside a card.
 *
 * The page was one stack of white panels, which made every part of it read as equally important. A band
 * with its own title says where the sales figures end and the people behind them begin.
 */
export const SectionHead = styled.div`
  margin: 10px 0 -4px;
`

export const SectionTitle = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${theme.colors.softWhite};
`

export const SectionSub = styled.p`
  margin: 4px 0 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: rgba(252, 252, 252, 0.62);
`

/**
 * The band's two figures, under its title.
 *
 * Capped rather than stretched: a tile is a figure and a line about it, and given the full width of the
 * page it becomes a mostly empty white bar with a number parked at the left. They keep a card's width and
 * sit together at the start of the row.
 */
export const AudienceTiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 300px));
  gap: 14px;
  align-items: start;

  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

/**
 * The buyers table. Same table, its own column widths.
 *
 * The sales feed's widths are tuned for an item name and a thumbnail in the first cell; here the first
 * cell is a person and the three after it are small counts, so reusing those widths left the numbers
 * stranded at the far right of columns twice the width they need.
 */
export const BuyerFeed = styled(Feed)`
  thead th:nth-of-type(1) {
    width: 40%;
  }
  thead th:nth-of-type(2) {
    width: 16%;
  }
  thead th:nth-of-type(3) {
    width: 20%;
  }
  thead th:nth-of-type(4) {
    width: 12%;
  }
  thead th:nth-of-type(5) {
    width: 12%;
  }
`

/**
 * The long list beside the column of short panels.
 *
 * The two sides are rarely the same height, so one ends before the other. That is accepted rather than
 * solved: a real store carries dozens of collections, which makes the list the taller side and the gap
 * small. Pairing the two short panels across the full width instead left each of them stretched, with
 * its figure stranded at the far edge of a mostly empty row.
 */
export const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

/**
 * An amount in a table cell, with its currency mark centred against the digits.
 *
 * A table cell lays its content out on the baseline, and the mark is a box rather than a glyph with one,
 * so it sat about a pixel and a half high next to every figure in both tables. The tiles never showed it
 * because their value row is already a flex container doing exactly this.
 */
export const Money = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;

  [data-kind] img,
  [data-kind] .ico {
    vertical-align: baseline;
  }
`

/** How much of the run has gone, as the design states it: claimed over the size of the whole run. */
export const Claimed = styled.span`
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: center;

  /* One weight and one colour, as the design draws it: the pair is a single reading ("80 of 250"), and
     dimming the denominator made the two halves look like different figures. */
  small {
    font-size: inherit;
    font-weight: inherit;
  }
`

/** The discount a collection is running, or the fact that it is not. */
/**
 * Everything about the discount running on a collection, in one cell.
 *
 * It used to be a panel of its own beside the table, which meant a creator read the same discount twice
 * and the two could disagree. Consolidated here: the cut, how long is left, how much of the allowance has
 * gone, and whether it moved anything.
 */
export const DiscountCell = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.gray4};
  text-align: center;
`

/** The cut and the countdown, side by side on the cell's first line. */
export const DiscountTop = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
`

/**
 * The cut, on this table's surface.
 *
 * The shared tag is drawn for a card's artwork — a gradient hairline around the fill — which at this size
 * reads as a smudge against a near-black row. Same fill and ink, no border, the design's own radius.
 */
export const Pct = styled(SaleTag)`
  align-self: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: ${theme.colors.saleTag};
  line-height: 20px;

  b,
  span {
    font-size: 14px;
    line-height: 20px;
  }
`

/**
 * The countdown, re-inked for this row.
 *
 * The shared chip is pink on the item page, beside the price it is cutting. Here it sits next to the pink
 * cut itself, and two pink chips in one cell made the pair read as one smear — so this one is the row's
 * own glass, which is what the design asks for.
 */
export const Window = styled(SaleTimer)`
  align-self: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: ${theme.colors.glass};
  color: ${theme.colors.white};

  b {
    color: ${theme.colors.white};
    font-size: 12px;
    line-height: 16px;
  }
`

/** How much of the allowance has gone, and whether the discount moved anything. */
export const DiscountFoot = styled.span`
  color: ${theme.colors.muted2};

  b {
    font-weight: 600;
  }
  /* Whether it is selling faster carries the only colour in the cell, since it is the only judgement. */
  &[data-dir='up'] b {
    color: #2ecc71;
  }
  &[data-dir='down'] b {
    color: #ff6b6b;
  }
`

/** The row's footer: how much of the list is on screen, and the way to the rest of it. */
export const ListFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.gray4};

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: stretch;
  }
`

/** The head of a panel that carries controls rather than a hint: a title, a sort, and one action. */
export const ListHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-wrap: wrap;
  }
`

export const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`

/**
 * The row's one action, drawn as the design draws it: no fill at all, a hairline white border and a white
 * label. A filled button in every row of a long list reads as a column of buttons rather than as a list.
 */
export const ManageBtn = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 0.5px solid ${theme.colors.white};
  border-radius: 12px;
  background: transparent;
  color: ${theme.colors.softWhite};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    background: ${theme.colors.glassFaint};
    color: ${theme.colors.softWhite};
  }
`

/** What a collection brought in over the window, as the design states it: the mark and the figure. */
export const Earned = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`

/**
 * How many people saved an item.
 *
 * The one demand signal a shopper leaves without paying, so a high count beside a low sold count is a
 * price to look at rather than an item to promote — which is the reading the old "saved, never bought"
 * row gave as a single number for the whole store. Per item it is actionable.
 */
export const Saves = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.gray4};
  white-space: nowrap;

  .ico {
    width: 14px;
    height: 14px;
  }
`

/**
 * The two short tables that sit across from each other: what is selling, and what just sold.
 *
 * Equal tracks rather than the weighted split {@link Columns} uses — these two carry the same five columns
 * and the same five rows, so giving one of them more width only strands its figures.
 */
export const Duo = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  /* Stretched rather than start-aligned: the sales rows carry a second line and the best sellers do not,
     so the two will never end together on their own, and two cards of different heights side by side read
     as one of them having failed to load. */

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

/** The panel's own subtitle, under its title rather than beside it. */
export const PanelSub = styled.p`
  margin: 2px 0 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.gray4};
`

export const PanelHeadStack = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

/** The way out of a table that only shows its first page: the whole history, where it can be filtered. */
export const ViewAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: underline;

  &:hover {
    color: ${theme.colors.navViolet};
  }
`

/** The position, not a count — dimmer than the name it numbers so it never reads as the figure. */
export const Rank = styled.span`
  display: inline-block;
  min-width: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.gray4};
`

export const RankCell = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`

/**
 * The gutters these two tables share.
 *
 * 18px each side is the full-width table's spacing and costs 36px of every track here, which is most of
 * what a relative date needs: at half the width the dates were ellipsised down to "2d a…" inside a column
 * wide enough to hold them twice over.
 */
const compactCells = `
  thead th,
  tbody td {
    padding-left: 12px;
    padding-right: 12px;
  }
`

/**
 * The best sellers' own column widths.
 *
 * The rank is a fixed gutter, the item takes what is left, and the two figures keep only the room their
 * digits need: on a half-width panel the shared widths put "Sold" halfway across an empty column.
 */
export const BestFeed = styled(Feed)`
  min-width: 500px;
  ${compactCells}

  thead th:nth-of-type(1) {
    width: 46%;
  }
  thead th:nth-of-type(2) {
    width: 26%;
  }
  thead th:nth-of-type(3) {
    width: 72px;
  }
  thead th:nth-of-type(4) {
    width: 96px;
  }
`

/**
 * The sales feed, re-tuned for half the width: five columns where there used to be a whole row.
 *
 * The buyer's track is fixed rather than a share, because its content does not scale with the panel: a
 * shortened address is always the same length, and as a percentage it was narrow enough to break one
 * across two lines and take the row's height with it.
 */
export const SaleFeed = styled(Feed)`
  min-width: 580px;
  ${compactCells}

  thead th:nth-of-type(1) {
    width: 34%;
  }
  thead th:nth-of-type(2) {
    width: 22%;
  }
  thead th:nth-of-type(3) {
    width: 70px;
  }
  thead th:nth-of-type(4) {
    width: 140px;
  }
  thead th:nth-of-type(5) {
    width: 76px;
  }
`

/** What kind of sale it was, under the item's name — the column it used to own went to the collection. */
export const SaleLines = styled.span`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`
