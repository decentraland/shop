import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { Icon } from '~/components/Icon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { SaleTag } from '~/components/SaleTag'
import { theme } from '~/styles/theme'

const { colors, radius, font, media } = theme

/** A surface inside the card: one step lighter than it, the way My Store lays panels on the page field. */
const raised = 'rgba(255, 255, 255, 0.06)'
const hairline = 'rgba(255, 255, 255, 0.12)'

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${theme.z.overlay};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(22, 21, 24, 0.6);
`

export const Card = styled.div`
  width: 560px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: ${colors.fieldBottomWashed};
  border: 1px solid ${hairline};
  border-radius: ${radius.modal};
  padding: 16px 20px 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: ${colors.softWhite};
  font-family: ${font.sans};

  /* The credits mark is pinned near-black for white cards (Icon.css); on this one it has to be light. */
  .ccy-mark,
  .ccy {
    color: ${colors.softWhite};
  }

  ${media.maxWidth('mobile')} {
    padding: 14px 16px 16px;
    gap: 16px;
  }
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.01em;
  color: ${colors.white};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-right: -8px;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  color: ${colors.softWhite};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:hover:not(:disabled) {
    background: ${raised};
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
`

export const Subtitle = styled.p`
  margin: -8px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: ${colors.gray4};
`

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

/** Lettered like the dashboard's tile keys, so the modal reads as part of the page it opened from. */
export const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${colors.gray4};
`

export const FieldHint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${colors.gray4};
`

export const CollectionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${hairline};
  border-radius: ${radius.card};
  background: ${raised};
`

/** The mosaic's frame: a fixed, rounded square so rows stay aligned whatever each collection holds. */
export const RowThumb = styled.span`
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: ${radius.btn};
  overflow: hidden;
  background: ${colors.media};
`

/** The choose-a-collection step: the same row, made clickable. */
export const PickList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
`

export const PickRow = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid ${hairline};
  border-radius: ${radius.card};
  background: ${raised};
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.1);
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
  .ico {
    margin-left: auto;
    transform: rotate(-90deg);
    color: ${colors.gray4};
  }
`

export const RowText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const RowInfo = RowText

export const RowName = styled.span`
  font-weight: 600;
  font-size: 15px;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const RowMeta = styled.span`
  font-size: 13px;
  color: ${colors.gray4};
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`

/** A preset: the Shop's own sale tag on a dark pill, ringed in white once picked. Tall enough to tap. */
export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 12px;
  border: 1px solid ${hairline};
  border-radius: ${radius.pill};
  background: ${raised};
  color: ${colors.softWhite};
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  /* The sale tag hugs the top of a column by default; in a pill it belongs in the middle. */
  > span {
    align-self: center;
  }
  &:hover:not(:disabled):not([data-selected]) {
    border-color: rgba(255, 255, 255, 0.32);
  }
  &[data-selected] {
    border-color: ${colors.softWhite};
    background: rgba(255, 255, 255, 0.14);
    box-shadow: 0 0 0 2px ${colors.softWhite};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 3px;
  }
`

/** A short framed number input with a unit around it (the custom percentage, the unit limit). */
export const InlineInput = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: ${radius.pill};
  background: ${raised};
  font-size: 14px;
  font-weight: 600;
  color: ${colors.softWhite};

  &:focus-within {
    border-color: ${colors.softWhite};
  }
  &[aria-invalid='true'] {
    border-color: ${colors.dclRed};
  }

  input {
    width: 48px;
    border: 0;
    outline: none;
    background: transparent;
    font-family: ${font.sans};
    font-size: 15px;
    font-weight: 700;
    color: ${colors.white};

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
    }
  }
`

/** Anchors the calendar under its trigger; the trigger stacks above it so the calendar slides out from behind. */
export const WhenWrap = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`

export const WhenTrigger = styled.button`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid ${hairline};
  border-radius: ${radius.card};
  background: ${raised};
  color: ${colors.softWhite};
  font-family: ${font.sans};
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  > span:not(.ico) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ico[data-open] {
    transform: rotate(180deg);
  }
  .ico {
    transition: transform 0.2s ease;
  }
  &:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.32);
  }
  /* Opaque while open: the calendar slides out from behind it. */
  &[aria-expanded='true'] {
    background: ${colors.softWhite};
    border-color: ${colors.softWhite};
    color: ${colors.text};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ico {
      transition: none;
    }
  }
`

export const CapRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 14px;
  color: ${colors.softWhite};

  /* Only the checkbox, not the number field the row can open. */
  > label > input {
    width: 20px;
    height: 20px;
    accent-color: ${colors.dclRed};
    cursor: pointer;
  }
`

export const CapLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`

/** What buyers will see: the collection's priciest listed items, drawn the way the Shop's cards draw them. */
export const PreviewGrid = styled.div`
  display: grid;
  /* Card-sized tracks: one item keeps the size of one card instead of stretching across the modal. */
  grid-template-columns: repeat(auto-fill, minmax(150px, 170px));
  gap: 10px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const PreviewCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border-radius: ${radius.card};
  background: ${raised};
  border: 1px solid ${hairline};
`

export const PreviewMedia = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: ${radius.btn};
  overflow: hidden;
  background: ${colors.media};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const PreviewTag = styled(SaleTag)`
  position: absolute;
  top: 6px;
  left: 6px;
`

export const PreviewName = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const PreviewPrices = styled.span`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
`

export const PreviewNow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 16px;
  font-weight: 700;
  color: ${colors.white};
`

export const PreviewWas = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.gray4};
  text-decoration: line-through;
`

/**
 * Text wearing the currency mark in front. Plain inline, not inline-flex — a flex box here makes `innerText`
 * break the line around it, which is the text the e2e suite reads the sentence from.
 */
export const Marked = styled.b`
  font-weight: 700;
  color: ${colors.white};
  white-space: nowrap;

  .ico {
    margin-right: 2px;
  }
`

/** The MANA mark, sized and seated like the credits one so both currencies read the same in a sentence. */
export const ManaMark = styled.img`
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  /* Drawn dark for white cards; this card is dark. */
  filter: brightness(0) invert(1);
`

export const Status = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${colors.gray4};
  text-align: center;
`

export const PrimaryBtn = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

export const ActionBtn = styled(Button)`
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
`

export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 16px;
  border-radius: ${radius.modal};
  background: ${raised};
  border: 1px solid ${hairline};
  text-align: center;
`

export const SuccessCheck = styled.div`
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${colors.ok};
  color: ${colors.white};

  .ico {
    width: 34px;
    height: 34px;
  }
`

export const SuccessText = styled.p`
  margin: 0;
  font-size: 22px;
  line-height: 1.4;
  color: ${colors.white};
`

export const SuccessDetail = styled.p`
  margin: 0;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  font-size: 15px;
  color: ${colors.gray4};
`

/**
 * A chip that becomes its own input.
 *
 * Two grid columns swapping between 0fr and 1fr: the chip collapses while the field opens in its place, and
 * because both tracks stay content-sized the animation survives translation.
 */
export const Morph = styled.div`
  display: inline-grid;
  grid-template-columns: 1fr 0fr;
  align-items: center;
  transition: grid-template-columns 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);

  &[data-open] {
    grid-template-columns: 0fr 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

/** Morph's sibling for a field with no chip to swap with — a checkbox opens it in place instead. */
export const Reveal = styled.div`
  display: inline-grid;
  grid-template-columns: 0fr;
  transition: grid-template-columns 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);

  &[data-open] {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const MorphCell = styled.div`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;

  /* The collapsed half is still in the DOM (it has to be, to animate back), so stop it catching clicks. */
  &[data-off] {
    pointer-events: none;
  }
`

/** The review step: what the sale will do, item by item, before anything is signed. */
export const ReviewSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: ${radius.card};
  background: ${raised};
  border: 1px solid ${hairline};
`

export const ReviewPct = styled.span`
  justify-self: start;
  display: inline-flex;
`

/** One row of the summary: its label, the value, and — for the window — how long until it. */
export const ReviewWhenRow = styled.div`
  display: grid;
  /* Fixed, not content-sized: each row is its own grid, so a max-content track would line each label up
     with nothing. 86px clears the longest label in any locale. */
  grid-template-columns: 86px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  font-size: 15px;
  line-height: 1.5;
`

export const ReviewWhenLabel = styled.span`
  color: ${colors.gray4};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

export const ReviewWhenValue = styled.b`
  font-weight: 700;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const ReviewWhenLeft = styled(SaleCountdown)`
  flex: none;
  padding: 0;
  background: none;
  color: ${colors.gray4};
  font-size: 14px;
  font-weight: 600;
`

export const ReviewGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const ReviewGroupTitle = styled.h3`
  margin: 0;
  font-weight: 600;
  font-size: 14px;
  color: ${colors.white};
`

export const ReviewList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* Long collections stay inside the modal instead of pushing the actions off-screen. */
  max-height: 232px;
  overflow-y: auto;
`

export const ReviewRow = styled.li`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: ${radius.btn};
  background: ${raised};
  border: 1px solid ${hairline};

  &[data-muted] {
    opacity: 0.7;
  }
`

export const ReviewThumb = styled.img`
  width: 40px;
  height: 40px;
  border-radius: ${radius.btn};
  object-fit: cover;
  background: ${colors.media};
`

export const ReviewName = styled.span`
  font-size: 15px;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** Two right-aligned columns so the old and new prices line up down the list. */
export const ReviewPrices = styled.span`
  display: grid;
  grid-template-columns: minmax(34px, auto) minmax(46px, auto);
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`

export const ReviewWas = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  color: ${colors.gray4};
  text-decoration: line-through;
  font-weight: 600;
  font-size: 15px;
`

export const ReviewNow = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-weight: 700;
  font-size: 19px;
  color: ${colors.white};
`

export const ReviewUnaffected = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${colors.gray4};
  white-space: nowrap;
`

/** Opens the reason a row is excluded. Focusable, so the explanation is reachable without a hover. */
export const UnaffectedInfo = styled(Icon)`
  /* Drawn at 14px, hit at 26px: padding cancelled by an equal negative margin. */
  width: 14px;
  height: 14px;
  padding: 6px;
  margin: -6px;
  box-sizing: content-box;
  color: ${colors.gray4};
  cursor: help;

  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
    border-radius: 50%;
  }
`

export const ReviewFoot = styled.p`
  margin: 0;
  padding: 12px 14px;
  border-radius: ${radius.card};
  background: rgba(255, 45, 85, 0.14);
  border: 1px solid rgba(255, 45, 85, 0.32);
  font-size: 14px;
  line-height: 1.45;
  color: ${colors.softWhite};

  b {
    font-weight: 700;
    color: ${colors.white};
  }
`

/** The one line that says what to do about a group the discount cannot reach. */
export const ReviewFootNote = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${colors.gray4};
`
