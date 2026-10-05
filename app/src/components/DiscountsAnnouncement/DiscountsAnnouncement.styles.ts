import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { SaleTag } from '~/components/SaleTag'
import { theme } from '~/styles/theme'

const { colors, radius, font, media } = theme

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
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  border: 1px solid ${hairline};
  border-radius: ${radius.modal};
  background: ${colors.modalViolet};
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  color: ${colors.softWhite};
  font-family: ${font.sans};

  /* The credits mark is pinned near-black for white cards; on this one it has to be light. */
  .ccy-mark {
    color: ${colors.softWhite};
  }
  &:focus {
    outline: none;
  }

  ${media.maxWidth('mobile')} {
    gap: 16px;
    padding: 16px;
  }
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const Eyebrow = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.gray4};
`

export const Close = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.softWhite};
  cursor: pointer;

  /* A tappable hit area around a glyph the design keeps small. */
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
`

export const Title = styled.h2`
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.25;
  text-wrap: balance;

  ${media.maxWidth('mobile')} {
    font-size: 22px;
  }
`

export const Lead = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: ${colors.gray4};

  b {
    color: ${colors.softWhite};
  }
`

export const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
`

export const Item = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid ${hairline};
  border-radius: ${radius.card};
  background: ${raised};
`

export const Media = styled.div`
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: ${radius.btn};
  background: ${colors.overlay};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Tag = styled(SaleTag)`
  position: absolute;
  top: 6px;
  left: 6px;
`

export const Name = styled.span`
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
`

export const Prices = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
`

export const Now = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 16px;
  font-weight: 700;
`

export const Was = styled.s`
  font-size: 13px;
  color: ${colors.gray4};
`

export const Steps = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
`

export const Step = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  line-height: 1.45;
  color: ${colors.gray5};

  b {
    color: ${colors.softWhite};
  }
`

export const StepNumber = styled.span`
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  font-size: 13px;
  font-weight: 700;
  color: ${colors.softWhite};
`

export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 20px;
  border-top: 0.5px solid rgba(255, 255, 255, 0.3);

  ${media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

export const ActionBtn = styled(Button)`
  flex: 0 1 242px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  height: auto;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.46px;
  line-height: 1.3;
  text-align: center;

  &[data-variant='white'] {
    border: 0.5px solid ${colors.softWhite};
    background: transparent;
    color: ${colors.softWhite};
  }
  &[data-variant='white']:hover:not(:disabled),
  &[data-variant='white']:active:not(:disabled) {
    background: ${colors.glassFaint};
  }

  ${media.maxWidth('mobile')} {
    flex: none;
    width: 100%;
  }
`
