import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { Shell } from '~/components/ManaPricingBanner/ManaPricingBanner.styles'
import { Chip as BaseChip } from '~/styles/chip.styles'
import { theme } from '~/styles/theme'

const { colors, font, media, radius } = theme

export const Empty = styled.div`
  max-width: 520px;
  margin: 0 auto;
  text-align: center;
  padding: 80px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`

export const EmptyIco = styled.span`
  font-size: 44px;
`

// h2, not h1: the tool is a section of the Activity page, which owns the page heading.
export const EmptyTitle = styled.h2`
  font-size: 26px;
  font-weight: 800;
  margin: 4px 0 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 10px;
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
  color: ${colors.text};
`

export const Lede = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.muted1};
`

export const LearnMore = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
  font-size: 14px;
  line-height: 30px;
  text-decoration: underline;
  color: ${colors.accent};

  .ico {
    width: 13px;
    height: 13px;
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

// Gray 4, not the subtler card hairline: this rule spans the full 1003px and has to stay readable as a
// section break, which is the weight the design draws it at.
export const Divider = styled.hr`
  width: 100%;
  height: 0;
  margin: 0;
  border: 0;
  border-top: 1px solid ${colors.gray4};
`

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 0;
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
  background: ${colors.brandViolet};
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
  color: ${colors.text};
  cursor: pointer;
`

// A fixed 40px slot so the checkbox lines up with the one on every row below it.
export const CheckSlot = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
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

  &[data-off] {
    opacity: 0.5;
  }
`

// Checkbox and thumbnail read as one unit, so they sit flush rather than taking the row's gap.
export const Lead = styled.div`
  flex: none;
  display: flex;
  align-items: center;
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
  /* Right-aligns the block on the desktop row AND on the line it wraps to on narrow screens. */
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
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

  /* The MONOCHROME credit glyph, in the text colour and matched to the amount beside it: the filled
     gradient mark is right for a price you are being SHOWN, and this is a price you are typing, so the
     unit belongs to the input's own type. 17px is the size the design draws the mark at here. */
  & .ico {
    flex: 0 0 auto;
    width: 17px;
    height: 17px;
    color: ${colors.text};
  }
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:focus-within {
    border-color: ${colors.accent};
    box-shadow: 0 0 0 3px ${colors.rarityBg};
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
  background: rgba(255, 255, 255, 0.9);
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

  ${media.maxWidth('mobile')} {
    padding: 12px 16px;
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
`

export const DockSub = styled.div`
  font-size: 13px;
  color: ${colors.muted};
`

export const DockSpacer = styled.span`
  flex: 1 1 auto;
`

export const DockCta = styled(Button)`
  flex: none;
  padding: 13px 24px;
`

// The 12px side gutter is Body's, so the FAQ rows line up with the listings above, not the page edge.
export const FaqBlock = styled.div`
  padding: 16px 12px 0;
`
