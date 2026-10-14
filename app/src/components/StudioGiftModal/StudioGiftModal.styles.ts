import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, font, media } = theme

// Drawn like the discounts modal (CreatorSaleModal): a dark card on the page's purple, panels one step lighter
// than it, hairline edges, and outlined secondary actions.
const raised = 'rgba(255, 255, 255, 0.06)'
const hairline = 'rgba(255, 255, 255, 0.12)'
const focusEdge = 'rgba(255, 255, 255, 0.4)'
// dclRed reads at 4:1 on this card and lower on its panels; text needs 4.5:1, so error words use this lighter red
// (6.8:1 on the card, 4.9:1 on a panel). dclRed stays for borders.
const errorText = '#ff8fa3'

// The card's own padding, which the pinned actions bleed back out over to reach its edges.
const CARD_PAD = 24
const CARD_PAD_MOBILE = 16

export const Card = styled.div`
  background: ${colors.fieldBottomWashed};
  color: ${colors.softWhite};
  border: 1px solid ${hairline};
  border-radius: ${radius.modal};
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  font-family: ${font.sans};
  padding: 20px ${CARD_PAD}px ${CARD_PAD}px;
  width: min(760px, 94vw);
  margin: auto;
  max-height: 100%;
  overflow-y: auto;
  /* Keeps a focused field clear of the pinned actions when the browser scrolls it into view. */
  scroll-padding-bottom: 104px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  /* The credits mark is pinned near-black for white cards (Icon.css); on this one it has to be light. */
  .ccy-mark,
  .ccy {
    color: ${colors.softWhite};
  }

  /* The in-form buttons (add a player, paste a list) keep their variants, outlined in light for this card. */
  & [data-variant='outline'] {
    background: transparent;
    border: 0.5px solid ${colors.softWhite};
    color: ${colors.softWhite};
  }
  & [data-variant='outline']:hover:not(:disabled),
  & [data-variant='outline']:active:not(:disabled) {
    background: ${colors.glassFaint};
    border-color: ${colors.softWhite};
  }
  & [data-variant='ghost'] {
    background: transparent;
    border: 1px solid ${hairline};
    color: ${colors.softWhite};
  }
  & [data-variant='ghost']:hover:not(:disabled),
  & [data-variant='ghost']:active:not(:disabled) {
    background: ${colors.glassFaint};
  }

  ${media.maxWidth('mobile')} {
    padding: 14px ${CARD_PAD_MOBILE}px ${CARD_PAD_MOBILE}px;
  }
`

export const Head = styled.div`
  padding-bottom: 14px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.3);
`

export const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 700;
`

/**
 * The modal's foot: ruled off from the form, the way out on the left and the way on at the right, pinned to the
 * bottom of the card so a long list never hides the button that moves it on.
 */
export const Actions = styled.div`
  position: sticky;
  bottom: -${CARD_PAD}px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin: 0 -${CARD_PAD}px -${CARD_PAD}px;
  padding: 16px ${CARD_PAD}px ${CARD_PAD}px;
  border-top: 0.5px solid rgba(255, 255, 255, 0.3);
  background: ${colors.fieldBottomWashed};
  box-shadow: 0 -12px 24px -12px rgba(0, 0, 0, 0.45);

  /* Tighter than Button's own padding, like the discounts modal's actions, so three buttons fit a phone's foot
     and a long label wraps inside its button. */
  & > button {
    flex: 0 1 242px;
    min-height: 46px;
    padding: 6px 12px;
    border-radius: 12px;
    line-height: 1.3;
    text-align: center;
  }

  /* The secondary action is an outline on this card, not a white slab. */
  & > [data-variant='white'] {
    border: 0.5px solid ${colors.softWhite};
    background: transparent;
    color: ${colors.softWhite};
    text-transform: uppercase;
    letter-spacing: 0.046em;
    font-size: 13px;
  }
  & > [data-variant='white']:hover:not(:disabled),
  & > [data-variant='white']:active:not(:disabled) {
    background: ${colors.glassFaint};
  }

  ${media.maxWidth('mobile')} {
    bottom: -${CARD_PAD_MOBILE}px;
    margin: 0 -${CARD_PAD_MOBILE}px -${CARD_PAD_MOBILE}px;
    padding: 12px ${CARD_PAD_MOBILE}px ${CARD_PAD_MOBILE}px;

    & > button {
      flex: 1 1 0;
      min-width: 0;
    }
  }
`

export const Note = styled.p`
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid ${hairline};
  background: ${raised};
  font-size: 14px;
  line-height: 1.45;

  &[data-tone='warning'] {
    border-color: rgba(255, 188, 91, 0.45);
    background: rgba(255, 188, 91, 0.12);
  }
  &[data-tone='success'] {
    border-color: rgba(52, 206, 119, 0.45);
    background: rgba(52, 206, 119, 0.12);
  }
`

export const RepeatLine = styled.span`
  display: block;
`

export const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;

  & small {
    font-weight: 400;
    color: ${colors.gray4};
  }
`

const field = `
  background: ${raised};
  border: 1px solid ${hairline};
  border-radius: 8px;
  padding: 10px 12px;
  color: ${colors.softWhite};
  font: inherit;
  min-width: 0;
  outline: none;

  &::placeholder {
    color: ${colors.gray4};
    opacity: 1;
  }
  &:focus {
    border-color: ${focusEdge};
  }
  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
  }
  &[aria-invalid='true'] {
    border-color: ${colors.dclRed};
  }
`

export const Input = styled.input`
  ${field}
`

export const Textarea = styled.textarea`
  ${field}
  min-height: 96px;
  resize: vertical;
`

export const Rows = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

export const Row = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(0, 0.8fr) minmax(0, 1.6fr) 44px;
  gap: 8px;
  align-items: start;

  & > [data-cell='problem'] {
    grid-column: 1 / -1;
    margin-top: -4px;
  }

  ${media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px;
    padding-bottom: 10px;
    border-bottom: 1px solid ${hairline};

    & > [data-cell='account'] {
      grid-column: 1 / -1;
    }
  }
`

export const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`

export const Problem = styled.span`
  color: ${errorText};
  font-size: 12px;
`

export const RemoveButton = styled.button`
  width: 44px;
  height: 44px;
  border: 1px solid ${hairline};
  border-radius: 8px;
  background: transparent;
  color: ${colors.gray4};
  cursor: pointer;
  font-size: 18px;

  &:hover,
  &:focus-visible {
    color: ${colors.softWhite};
    border-color: ${focusEdge};
  }
`

export const Inline = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`

export const Summary = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${colors.gray4};
`

export const ErrorText = styled.p`
  margin: 0;
  color: ${errorText};
  font-size: 14px;
`

export const Outcomes = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid ${hairline};
  border-radius: 10px;
  background: ${raised};
`

export const Outcome = styled.li`
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  font-size: 14px;

  & + & {
    border-top: 1px solid ${hairline};
  }

  ${media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr) auto;

    & > [data-cell='detail'] {
      grid-column: 1 / -1;
    }
  }
`

export const Status = styled.span`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: ${colors.gray4};

  &[data-status='gifted'],
  &[data-status='alreadyGifted'] {
    color: ${colors.successBorder};
  }
  &[data-status='refused'] {
    color: ${errorText};
  }
  &[data-status='blocked'],
  &[data-status='unknown'] {
    color: ${colors.flareAmber};
  }
`

export const Detail = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;

  & code {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  & small {
    color: ${colors.gray4};
  }
`
