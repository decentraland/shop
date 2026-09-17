import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, font, media } = theme

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

/** The collection's mosaic, at the same 40px the My Creations headers draw it. */
export const Thumb = styled.span`
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: ${radius.btn};
  overflow: hidden;
  background: ${colors.media};
`

export const Row = styled.div`
  display: grid;
  /* Three tracks: the mosaic, the text, the action. The discount moved in with the text, where it lines up
     with the timer instead of floating between the row's two lines. */
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  /* Roomier than the 12/14 it started at: the row carries two chips now, and at their height the old
     padding left them pressed against the card's edges. */
  padding: 16px 18px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  background: ${colors.white};

  &[data-status='ended'],
  &[data-status='cancelled'],
  &[data-status='exhausted'],
  &[data-status='revoked'] {
    opacity: 0.7;
  }

  ${media.maxWidth('mobile')} {
    grid-template-columns: auto minmax(0, 1fr);

    > :last-child {
      grid-column: 1 / -1;
    }
  }
`

export const Info = styled.div`
  display: flex;
  flex-direction: column;
  /* The name sits on one line and the figures on the next; at 4px the chips touched the name above them. */
  gap: 8px;
  min-width: 0;
`

export const Line = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`

export const Collections = styled.span`
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 14px;
  color: ${colors.text};
`

export const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${radius.pill};
  font-family: ${font.sans};
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  background: ${colors.chip};
  color: ${colors.muted};

  &[data-status='active'] {
    background: ${colors.successBg};
    color: ${colors.okStrong};
  }
  &[data-status='scheduled'] {
    background: ${colors.promptLilac};
    color: ${colors.accent};
  }
`

export const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-family: ${font.sans};
  font-size: 12px;
  color: ${colors.muted};
`

export const Confirm = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

/**
 * How the discount is doing against the days before it started.
 *
 * Sits with the other chips in the row's meta line rather than in a column of its own: it is the same kind
 * of aside as the timer and the uses, and a column would give it a weight the figure has not earned on a
 * sale that has been live for a day.
 */
export const Lift = styled.span`
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  cursor: help;
  color: ${theme.colors.muted};

  &[data-dir='up'] {
    color: #1f9d55;
  }
  &[data-dir='down'] {
    color: #d64545;
  }
`
