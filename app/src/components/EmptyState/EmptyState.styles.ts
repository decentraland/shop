import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, font, radius } = theme

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  /* The panel hugs its copy rather than stretching to the column — the body's max-width sets how
     wide it can get, and it stays centred in whatever space it's given. */
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 16px 16px 32px;
  border-radius: 16px;
  text-align: center;
  background: ${colors.overlayLight};
  color: ${colors.softWhite};

  &[data-variant='light'] {
    background: ${colors.white};
    color: ${colors.text};
  }
`

export const Illustration = styled.img`
  width: 138px;
  height: 138px;

  ${theme.media.maxWidth('mobile')} {
    width: 110px;
    height: 110px;
  }
`

export const Text = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
`

export const Title = styled.p`
  margin: 0;
  font-family: ${font.sans};
  font-weight: 700;
  font-size: 20px;
  line-height: 1.6;
`

export const Body = styled.p`
  margin: 0;
  max-width: 540px;
  font-family: ${font.sans};
  font-weight: 400;
  font-size: 16px;
  line-height: 1.6;

  b {
    font-weight: 600;
  }
`

const cta = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 310px;
  max-width: 100%;
  height: 52px;
  padding: 0 12px;
  border: 0;
  border-radius: ${radius.card};
  font-family: ${font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;

  background: ${colors.overlay};
  color: ${colors.softWhite};

  &:hover {
    background: rgba(0, 0, 0, 0.55);
  }
  &:active {
    background: rgba(0, 0, 0, 0.65);
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }

  &[data-variant='light'] {
    background: ${colors.accent};
    color: ${colors.softWhite};

    &:hover,
    &:active {
      background: ${colors.accentHover};
    }
    &:focus-visible {
      outline-color: ${colors.accent};
    }
  }
`

export const CtaLink = styled(Link)`
  ${cta}
`

export const CtaButton = styled.button`
  ${cta}
`
