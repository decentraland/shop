import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

export const Card = styled.div`
  background: ${colors.white};
  color: ${colors.text};
  border-radius: ${radius.card};
  padding: 24px;
  width: min(760px, 94vw);
  margin: auto;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;

  ${media.maxWidth('mobile')} {
    padding: 18px 14px;
  }
`

export const Note = styled.p`
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: ${colors.promptLilac};
  font-size: 14px;
  line-height: 1.45;

  &[data-tone='warning'] {
    background: ${colors.promptAmber};
  }
  &[data-tone='success'] {
    background: ${colors.successBg};
  }
`

export const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;

  & small {
    font-weight: 400;
    color: ${colors.muted};
  }
`

export const Input = styled.input`
  background: ${colors.white};
  border: 1px solid ${colors.lineStrong};
  border-radius: 8px;
  padding: 10px 12px;
  color: ${colors.text};
  font: inherit;
  min-width: 0;

  &[aria-invalid='true'] {
    border-color: ${colors.errStrong};
  }
`

export const Textarea = styled.textarea`
  background: ${colors.white};
  border: 1px solid ${colors.lineStrong};
  border-radius: 8px;
  padding: 10px 12px;
  color: ${colors.text};
  font: inherit;
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
    border-bottom: 1px solid ${colors.line};

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
  color: ${colors.errStrong};
  font-size: 12px;
`

export const RemoveButton = styled.button`
  width: 44px;
  height: 44px;
  border: 1px solid ${colors.line};
  border-radius: 8px;
  background: ${colors.white};
  color: ${colors.muted};
  cursor: pointer;
  font-size: 18px;

  &:hover,
  &:focus-visible {
    color: ${colors.text};
    border-color: ${colors.lineStrong};
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
  color: ${colors.muted1};
`

export const ErrorText = styled.p`
  margin: 0;
  color: ${colors.errStrong};
  font-size: 14px;
`

export const Outcomes = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid ${colors.line};
  border-radius: 10px;
`

export const Outcome = styled.li`
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  font-size: 14px;

  & + & {
    border-top: 1px solid ${colors.line};
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
  color: ${colors.muted1};

  &[data-status='gifted'],
  &[data-status='alreadyGifted'] {
    color: ${colors.okStrong};
  }
  &[data-status='refused'] {
    color: ${colors.errStrong};
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
    color: ${colors.muted};
  }
`
