import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, font, media } = theme

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Row = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
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

// The same red tag the cards and the item page use for "SALE −X%".
export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  background: ${colors.dclRed};
  color: ${colors.white};
  font-family: ${font.sans};
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.03em;
`

export const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  gap: 6px 14px;
  font-family: ${font.sans};
  font-size: 12px;
  color: ${colors.muted};
`

export const Confirm = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
