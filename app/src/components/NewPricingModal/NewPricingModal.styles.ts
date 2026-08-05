import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, font, radius, z } = theme

// Mirrors the modal shell shared by the Issue / Sell / Primary-list modals (white 16px card, header
// with a close, purple ctas) rather than importing from them, per the convention those files set.

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
  border-radius: ${radius.modal};
  background: ${colors.white};
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
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
  border-bottom: 1px solid ${colors.gray4};
`

export const Title = styled.h2`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${colors.text};
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
  color: ${colors.text};

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
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const Info = styled.div`
  padding: 16px;
  border-radius: ${radius.modal};
  background: ${colors.infoGreen};
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const InfoTitle = styled.h3`
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.57;
  color: ${colors.text};
`

export const InfoText = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.text2};
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

// Solid purple fill and a 2px purple outline at a 12px radius — the shared Button primitive's `purple`
// and `outline` variants are the amethyst gradient and a magenta border, so they can't dress these.
const cta = `
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: ${radius.card};
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const Secondary = styled.button`
  ${cta};
  border: 2px solid ${colors.accent};
  background: ${colors.white};
  color: ${colors.accent};

  &:hover {
    background: ${colors.rarityBg};
  }
`

export const Primary = styled.button`
  ${cta};
  border: 0;
  background: ${colors.accent};
  color: ${colors.softWhite};

  &:hover {
    background: ${colors.accentHover};
  }
  &:active {
    background: ${colors.accentActive};
  }
`

export const OptOut = styled.label`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14.049px;
  line-height: normal;
  color: ${colors.text};
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
  }
`
