import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { dark, darkCard } from '~/styles/darkSurface'

const { colors, font, radius, z } = theme

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${z.overlay};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 16px;
  background: rgba(22, 21, 24, 0.55);
`

export const Card = styled.div`
  width: 560px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 12px 16px 16px;
  ${darkCard}
  border-radius: ${radius.modal};
  display: flex;
  flex-direction: column;
  gap: 24px;
  font-family: ${font.sans};

  /* Focused on mount for screen readers; it is not tab-reachable, so it never needs a visible ring. */
  &:focus {
    outline: none;
  }
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 0.5px solid ${dark.rule};
`

export const Title = styled.h2`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${colors.softWhite};
`

export const Close = styled.button`
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 18.535px;
  height: 18.535px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${colors.softWhite};

  .ico {
    width: 100%;
    height: 100%;
  }
  /* Keeps the glyph exactly where the design puts it while giving it a tappable hit area. */
  &::after {
    content: '';
    position: absolute;
    inset: -11px;
  }
  &:focus-visible {
    outline: 2px solid ${colors.white};
    outline-offset: 2px;
  }
`

export const Info = styled.div`
  padding: 16px;
  border-radius: ${radius.modal};
  border: 1px solid rgba(52, 206, 119, 0.45);
  background: rgba(52, 206, 119, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const InfoTitle = styled.h3`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.57;
  color: ${colors.softWhite};
`

export const InfoText = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.glassText};
`

export const Foot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Ctas = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

// Sizing only: the colours are the shared Button variants (primary gradient; outline, which the dark card
// redraws as a light hairline).
const cta = `
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 12px;
  border-radius: ${radius.card};
  font-family: ${font.sans};
  line-height: 24px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${colors.white};
    outline-offset: 2px;
  }
`

export const Secondary = styled(Button)`
  ${cta};
`

export const Primary = styled(Button)`
  ${cta};
`

export const OptOut = styled.label`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14.049px;
  line-height: normal;
  color: ${colors.softWhite};
  cursor: pointer;
`

// A 32px slot around the 13.7px square, which is what sets both the row's height and the gap before
// the label — the design has no gap of its own here.
export const OptOutBox = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;

  & input {
    --box: 13.714px;
    border-color: ${colors.glassText};
    background: transparent;
  }
  /* The accent fill would sink into the card, so a ticked box is soft-white with a card-coloured tick. */
  & input:checked {
    border-color: ${colors.softWhite};
    background: ${colors.softWhite};
  }
  & input:checked::before {
    border-color: ${colors.fieldBottomWashed};
  }
`
