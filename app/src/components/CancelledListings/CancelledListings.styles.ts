import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { Chip as BaseChip } from '~/styles/chip.styles'
import { theme } from '~/styles/theme'

const { colors, font, media, radius } = theme

export const Root = styled.section`
  max-width: 1003px;
  width: 100%;
  margin: 0 auto 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: ${font.sans};
`

export const Head = styled.header`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
`

export const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
`

export const Title = styled.h2`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 24px;
  letter-spacing: 0.46px;
  color: ${colors.white};
`

export const Count = styled.span`
  font-weight: 500;
  font-size: 14px;
  color: ${colors.gray5};
  font-variant-numeric: tabular-nums;
`

export const Lede = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.gray5};
`

export const List = styled.ul`
  margin: 0;
  padding: 0 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const Row = styled.li`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  row-gap: 12px;
  padding: 12px 16px 12px 12px;
  border: 1px solid ${colors.gray4};
  border-radius: ${radius.card};
  background: ${colors.white};
`

export const Thumb = styled.div`
  flex: none;
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  border-radius: 6.5px;
  background: ${colors.media};
  overflow: hidden;

  & img {
    width: 62px;
    height: 62px;
    object-fit: contain;
  }
`

export const Info = styled.div`
  flex: 1 1 150px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

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

export const Chip = styled(BaseChip)`
  align-self: flex-start;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;

  &[data-kind='bid'] {
    background: ${colors.promptLilac};
    color: ${colors.accent};
  }
`

export const Price = styled.div`
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  margin-left: auto;

  ${media.maxWidth('mobile')} {
    margin-left: 90px;
    align-items: flex-start;
  }
`

export const PriceLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${colors.muted};
`

export const PriceValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text};
  font-variant-numeric: tabular-nums;

  & .ico {
    width: 16px;
    height: 16px;
    color: ${colors.dclRed};
  }
`

export const Action = styled(Button)`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 184px;
  height: 40px;
  padding: 0 16px;

  & .ico {
    width: 14px;
    height: 14px;
  }

  ${media.maxWidth('mobile')} {
    flex: 1 1 100%;
  }
`

export const RowSkeleton = styled.li`
  height: 100px;
  border-radius: ${radius.card};
  background: linear-gradient(100deg, var(--skeleton-lo) 30%, var(--skeleton-hi) 50%, var(--skeleton-lo) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;

  ${media.maxWidth('mobile')} {
    height: 200px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
