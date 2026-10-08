import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Spinner } from '~/components/Spinner'

const { colors, radius, media } = theme

export const Loading = styled(Spinner)`
  display: grid;
  place-items: center;
  min-height: 50vh;
`

export const Root = styled.section`
  padding: 8px 0 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: ${colors.softWhite};
`

export const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

export const Heading = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  & h1 {
    margin: 0;
    font-size: 28px;
    overflow-wrap: anywhere;
  }
  & span {
    color: ${colors.muted2};
    font-size: 14px;
  }
`

export const Picker = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;

  & select {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid ${colors.lineStrong};
    padding: 8px 12px;
    font: inherit;
    color: ${colors.text};
    background: ${colors.white};
  }
`

export const Notice = styled.p`
  margin: 0;
  padding: 12px 16px;
  border-radius: 10px;
  background: ${colors.promptAmber};
  color: ${colors.text};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

export const Figures = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr);
  }

  & > div {
    padding: 16px;
    border-radius: ${radius.card};
    background: ${colors.overlay};
  }
  & dt {
    font-size: 13px;
    color: ${colors.muted2};
  }
  & dd {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 700;
  }
  & small {
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: ${colors.muted2};
  }
`

export const Gifts = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;

  & h2 {
    margin: 0;
    font-size: 20px;
  }
`

export const GiftList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: ${radius.card};
  background: ${colors.overlay};
`

export const Gift = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.7fr) minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px;
  font-size: 14px;

  & + & {
    border-top: 1px solid ${colors.overlayLight};
  }
  & code {
    overflow-wrap: anywhere;
  }
  & small {
    color: ${colors.muted2};
  }

  ${media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr) auto;

    & > [data-cell='reason'],
    & > [data-cell='when'] {
      grid-column: 1 / -1;
    }
  }
`

export const Empty = styled.p`
  margin: 0;
  color: ${colors.muted2};
`
