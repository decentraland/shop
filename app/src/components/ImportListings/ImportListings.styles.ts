import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { Shell } from '~/components/ManaPricingBanner/ManaPricingBanner.styles'
import { Chip as BaseChip } from '~/styles/chip.styles'
import { theme } from '~/styles/theme'

const { colors, font, media, radius } = theme

// The "nothing left to migrate" state: a white card centred in the section.
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px 20px 80px;
`

export const EmptyCard = styled.div`
  /* Full width, so it lines up with the FAQ block below it rather than sitting narrower than everything
     else on the page. */
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px;
  border-radius: ${radius.modal};
  background: ${colors.white};
  text-align: center;
`

/**
 * The check ring. An `<img>`, NOT the project's Icon: this glyph is a coral→red GRADIENT stroke, and Icon
 * paints every asset as a mask over currentColor, which would flatten it to one flat colour.
 *
 * Two boxes, as the design composes them: a 105px outer box holding an 84.837px leaf. That inner size is
 * not arbitrary — it is what the design's own nested insets (12.5% then -3.86%) resolve to, and it is the
 * asset's intrinsic size, so the ring is neither cropped nor upscaled.
 */
export const EmptyIco = styled.span`
  flex-shrink: 0;
  width: 105px;
  height: 105px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 84.837px;
    height: 84.837px;
  }
`

export const EmptyText = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  line-height: 1.6;
  color: ${colors.text};
`

// h2, not h1: the tool is a section of the Activity page, which owns the page heading.
export const EmptyTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
`

export const EmptyBody = styled.p`
  margin: 0;
  font-size: 16px;
  font-weight: 400;
`

export const EmptyActions = styled.div`
  width: 310px;
  max-width: 100%;
  padding-bottom: 16px;
`

export const EmptyCta = styled(Button)`
  width: 100%;
  height: 56px;
  border-radius: 12px;
  font-size: 15px;
  /* The variant sets 0.046em, which at 15px is 0.69px; the design asks for 0.46px flat. */
  letter-spacing: 0.46px;
  /* Filled FLAT with the accent here, not with the purple variant's amethyst gradient. Doubled ampersand
     because the variant's own fill is an attribute selector, which outranks a plain declaration — and the
     variant's hover overlay is that same accent, so it steps up a shade to still read as a hover. */
  &&[data-variant='purple'] {
    background: ${colors.accent};
  }

  &:hover:not(:disabled)::before,
  &:active:not(:disabled)::before {
    background: ${colors.accentHover};
  }
`

export const Root = styled.div`
  max-width: 1003px;
  margin: 0 auto;
  padding-bottom: 120px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: ${font.sans};
`

export const Head = styled.header`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px 12px;
`

export const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Title = styled.h2`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 24px;
  letter-spacing: 0.46px;
  color: ${colors.white};
`

// Gray 4, the dimmer of the two whites the design sets on this field — the heading above it is the
// bright one, and the pair is what keeps the paragraph from competing with it.
export const Lede = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.gray4};
`

export const LearnMore = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
  font-size: 14px;
  line-height: 30px;
  text-decoration: underline;
  color: ${colors.white};

  .ico {
    width: 13px;
    height: 13px;
  }
  &:focus-visible {
    outline: 2px solid ${colors.white};
    outline-offset: 2px;
  }
`

// White at a quarter strength, which is what the design's hairline composites to over the violet page.
// A solid grey (even Gray 4) reads as a bright rule there rather than as a section break.
export const Divider = styled.hr`
  width: 100%;
  height: 0;
  margin: 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.25);
`

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
`

// The same lilac strip as the My Assets nudge, carrying a count instead of a call to action.
export const Progress = styled(Shell)`
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.text2};
`

export const Count = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: ${radius.pill};
  background: ${colors.dclRed};
  font-weight: 600;
  font-size: 12px;
  line-height: 1.6;
  color: ${colors.white};
`

export const ListBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const SelectAll = styled.label`
  display: flex;
  align-items: center;
  align-self: flex-start;
  font-size: 14px;
  line-height: 1.2;
  color: ${colors.white};
  cursor: pointer;
`

/**
 * A fixed 40px slot so the checkbox lines up with the one on every row below it.
 *
 * It also dresses the checkbox it holds, because the design gives this tool two skins of the shared
 * control and neither is the primitive's default: ticked is the primary red here, not violet, and the
 * `on-dark` slot (Select All, which sits on the violet page rather than on a white row) drops the white
 * fill for the page itself so only the outline shows.
 */
export const CheckSlot = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;

  & input:checked,
  & input[data-indeterminate='true'] {
    background: ${colors.dclRed};
    border-color: ${colors.dclRed};
  }

  &[data-tone='on-dark'] input {
    background: transparent;
    border-color: ${colors.white};
  }
  &[data-tone='on-dark'] input:checked,
  &[data-tone='on-dark'] input[data-indeterminate='true'] {
    background: ${colors.dclRed};
    border-color: ${colors.dclRed};
  }
  &[data-tone='on-dark'] input:focus-visible {
    outline-color: ${colors.white};
  }
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const Row = styled.article`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 8px;
  padding: 12px 24px 12px 0;
  border: 1px solid ${colors.gray4};
  border-radius: ${radius.card};
  background: ${colors.white};
  overflow: hidden;
  transition: opacity 0.25s ease;
`

// Checkbox and thumbnail read as one unit, so they sit flush rather than taking the row's gap.
export const Lead = styled.div`
  flex: none;
  display: flex;
  align-items: center;

  /* On a phone the design tops the checkbox against the thumbnail instead of centring it — the card is
     three lines tall there, and a centred tick drifts away from the item it belongs to. */
  ${media.maxWidth('mobile')} {
    align-items: flex-start;
  }
`

export const Thumb = styled.div`
  flex: none;
  display: grid;
  place-items: center;
  width: 74.289px;
  height: 74px;
  border-radius: 6.482px;
  background: ${colors.media};
  overflow: hidden;

  & img {
    width: 61.57px;
    height: 61.281px;
    object-fit: contain;
    filter: drop-shadow(0.303px 1.212px 1.516px rgba(0, 0, 0, 0.1));
  }
`

export const Info = styled.div`
  /* Basis (not min-width) is what makes the price column wrap to its own line on a phone; min-width: 0
     then lets the name ellipsize once it is on a line of its own. */
  flex: 1 1 150px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;

  /* A smaller basis on a phone, where the name and chips have to STAY beside the thumbnail: at 150px the
     pair no longer fits the line on the narrowest handsets and the block dropped below the artwork. */
  ${media.maxWidth('mobile')} {
    flex-basis: 100px;
  }
`

export const Name = styled.div`
  font-weight: 600;
  font-size: 16px;
  line-height: 1.2;
  color: ${colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Chips = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 4px;
`

export const Chip = styled(BaseChip)`
  padding: 1.623px 6.491px;
  font-weight: 600;
  font-size: 8.56px;
  line-height: 11.851px;

  /* Same padding as the rarity chip beside it — the design sets the category chip flush with it, and
     only the narrower gender chip (which this row does not carry) gets the tighter inset. Restated
     rather than inherited because the shared chip's own icon variant is a more specific selector. */
  &[data-variant='icon'] {
    padding: 1.623px 6.491px;
  }
  &[data-variant='icon'] .ico {
    width: 14.605px;
    height: 14.605px;
  }
`

export const Price = styled.div`
  flex: none;
  /* Right-aligns the block on the desktop row. */
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;

  /* The phone card gives the price a line of its own, running the full width of the row — but indented by
     the checkbox slot, so it starts under the thumbnail rather than under the tick. */
  ${media.maxWidth('mobile')} {
    flex: 1 1 100%;
    margin-left: 40px;
    align-items: stretch;
  }
`

export const PriceField = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 144px;
  height: 42px;
  padding: 8px;
  border: 0.5px solid ${colors.muted2};
  border-radius: ${radius.btn};
  background: ${colors.panel};

  /* The OUTLINED credit glyph, not the filled gradient mark: the filled one is right for a price you are
     being shown, and this is a price you are typing. The design still draws it in the currency's own red
     rather than in the input's ink, so the unit stays legible as a unit. 17px is the size it draws at. */
  & .ico {
    flex: 0 0 auto;
    width: 17px;
    height: 17px;
    color: ${colors.dclRed};
  }
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:focus-within {
    border-color: ${colors.accent};
    box-shadow: 0 0 0 3px ${colors.rarityBg};
  }

  ${media.maxWidth('mobile')} {
    width: 100%;
  }
`

export const PriceInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text};
  text-align: right;
  font-variant-numeric: tabular-nums;
`

export const PriceSub = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-weight: 500;
  font-size: 12px;
  color: ${colors.gray0};

  /* Centred under the full-width field it converts, not parked at its right edge. */
  ${media.maxWidth('mobile')} {
    justify-content: center;
  }
`

export const PriceWas = styled.span`
  font-weight: 300;
  font-size: 10px;
  color: ${colors.muted};
`

// The `shimmer` keyframe is global (index.css).
export const SkeletonRow = styled.div`
  height: 101px;
  border: 1px solid transparent;
  border-radius: ${radius.card};
  background: linear-gradient(100deg, #ededed 30%, #f7f7f7 50%, #ededed 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;
`

export const Dock = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: ${colors.white};
  backdrop-filter: blur(12px);
  border-top: 1px solid ${colors.line};
`

export const DockInner = styled.div`
  max-width: 1003px;
  margin: 0 auto;
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 16px;

  /* On a phone the design stacks the bar: the summary line, then the cta across the full width. */
  ${media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px;
    gap: 12px;
  }
`

// row-reverse on a phone, where the design reads the total on the RIGHT of the line and the count on
// the left — the stacked total-over-count block is the desktop arrangement.
export const DockInfo = styled.div`
  ${media.maxWidth('mobile')} {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
`

export const DockTotal = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text};

  & .ico {
    width: 17px;
    height: 17px;
  }
`

export const DockSub = styled.div`
  font-size: 13px;
  color: ${colors.muted};
`

export const DockSpacer = styled.span`
  flex: 1 1 auto;

  ${media.maxWidth('mobile')} {
    display: none;
  }
`

export const DockCta = styled(Button)`
  flex: none;
  min-width: 260px;
  padding: 13px 24px;

  ${media.maxWidth('mobile')} {
    min-width: 0;
  }
`

// The 12px side gutter is Body's, so the FAQ rows line up with the listings above, not the page edge.
export const FaqBlock = styled.div`
  padding: 16px 12px 0;

  /* The outlined dark rows, but NOT the credits page's centred 32px heading that ships with them: here
     the section is one more block in the tool's left-aligned column, so the heading keeps the light
     skin's size and alignment. The doubled ampersand is what outranks Faq's own tone selectors, which
     Emotion inserts after this block (the Faq renders inside it). */
  && [data-tone='on-dark'] {
    align-items: stretch;
  }
  && [data-testid='faq-title'] {
    font-size: 20px;
    text-align: left;

    ${media.maxWidth('mobile')} {
      font-size: 18px;
    }
  }
`
