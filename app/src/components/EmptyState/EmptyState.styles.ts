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
  padding: 16px 32px;
  border-radius: 16px;
  text-align: center;
  background: ${colors.overlayLight};
  color: ${colors.softWhite};

  &[data-variant='light'] {
    background: ${colors.white};
    color: ${colors.text};
  }

  /* The signed-out screens hand the panel the whole content column and let it centre its own stack
     inside it, which is how the design draws it (Figma 3351:319886: a 1495x618 panel with the 340px
     stack centred at y=139). Every other empty state still hugs its copy. */
  &[data-fill='true'] {
    width: 100%;
    flex: 1;
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

  &:last-child {
    padding-bottom: 32px;
  }
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
  margin-bottom: 16px;
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

  /* The solid treatment, for an empty state whose CTA is the point of the screen rather than a way out
     of it — a signed-out page, where the translucent default sits dark-on-dark and barely reads. Matches
     Button variant="white", which is what those pages used before they moved onto this component. */
  &[data-cta='solid'] {
    background: ${colors.softWhite};
    color: ${colors.text2};
  }
  &[data-cta='solid']:hover {
    background: ${colors.panel};
  }
  &[data-cta='solid']:active {
    background: ${colors.panel};
    transform: translateY(1px);
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

/**
 * Reserves the height a signed-out screen's empty state is drawn at, and stacks whatever the page puts
 * under it.
 *
 * 618px is where the design places the panel (the instance in Figma 3351:319886). The master component
 * behind it hugs its content at 372px, but that is a property of the component, not the placement — at
 * 372 the panel reads as a small box adrift on a page this wide. The page shell's 100vh floor is lifted
 * for these screens (.page:has([data-fill]) in styles/index.css) so the footer follows the panel instead
 * of a screenful of empty purple. Centred rather than stretched so an ErrorNotice under the panel stays
 * sized to its content instead of becoming a full-bleed, left-aligned bar.
 */
export const Centered = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-height: 618px;

  ${theme.media.maxWidth('mobile')} {
    /* A phone is narrower than the panel is tall, so the air the desktop placement buys turns into a
       scroll. The component's own height is the better read there. */
    min-height: 0;
  }
`
