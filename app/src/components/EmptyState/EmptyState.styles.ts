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
 * Gives a signed-out screen's empty state the content column to fill.
 *
 * The design draws the panel across the whole column and centres its stack inside it, rather than
 * letting a short panel cling to the top of a screen of empty purple — which is what the three
 * hand-rolled sign-in gates all did, each slightly differently. 618px is the panel's height in
 * Figma 3351:319886; the vh cap keeps a short viewport from scrolling to reach the button.
 */
export const Centered = styled.div`
  display: flex;
  flex-direction: column;
  /* Centred rather than stretched: the panel spans the column on its own (it sets width: 100%), while
     anything a page stacks under it — an ErrorNotice after a failed sign-in — stays sized to its content
     instead of becoming a full-bleed, left-aligned bar. */
  align-items: center;
  /* Fills the page shell's content box, so the panel reaches the bottom of the screen and its stack lands
     on the vertical middle — a fixed height ended the panel partway down and left a screenful of empty
     purple under it. The .page shell is a block box carrying its own min-height of 100vh minus the nav, and
     28/80 of vertical padding, so there is no resolved height to inherit and the same span is recomputed
     here. 618px, the panel's height in Figma 3351:319886, is the floor. */
  min-height: max(618px, calc(100vh - var(--nav-h) - 108px));

  ${theme.media.maxWidth('mobile')} {
    /* A phone has no room for the 618px floor, and the sub-nav band between the navbar and the page wraps
       to two rows here (66px -> 123px), so more has to come off: 72px of shell padding plus the 68px the
       taller band adds. Measured rather than derived — the sub-nav renders its own height and exposes no
       variable to subtract. Lands the panel on the fold instead of 67px past it. */
    min-height: calc(100vh - var(--nav-h) - 140px);
  }
`
