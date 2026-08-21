import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, font, radius, z } = theme

// Mirrors the modal shell shared by the New-pricing / Issue / Sell / Primary-list modals (white 16px card,
// header with a close, a callout block, two ctas) rather than importing from them, per the convention
// those files set. Figma 2230:113615.

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

// The lilac callout, CENTRED and with taller vertical padding than the shell's other blocks — this one is
// carrying an illustration rather than a paragraph, so the design gives it the room.
export const Info = styled.div`
  padding: 24px 16px;
  border-radius: ${radius.modal};
  background: ${colors.promptLilac};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
`

/**
 * The bag, at the size the design draws it.
 *
 * An `img`, not an `Icon`: the shop's icons are monochrome glyphs used as CSS masks and tinted by
 * currentColor, and this one is a two-stop brand gradient (#ff7439 → #ff2d55, the buy-button ramp). A mask
 * would flatten it to one colour.
 */
export const BagArt = styled.img`
  flex: none;
  width: 76px;
  height: 76px;
`

export const InfoTitle = styled.h3`
  margin: 0;
  font-weight: 700;
  font-size: 20px;
  line-height: 1.334;
  color: ${colors.text2};
`

export const InfoText = styled.p`
  margin: 0;
  font-weight: 400;
  font-size: 16px;
  line-height: 1.334;
  color: ${colors.text2};
`

export const Ctas = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const cta = `
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 46px;
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

// The dismissal: a 0.5px dark hairline and a dark label, same as the shell's other secondary.
export const Secondary = styled.button`
  ${cta};
  border: 0.5px solid ${colors.text};
  background: ${colors.white};
  color: ${colors.text2};

  &:hover {
    background: ${colors.panel};
  }
`

/**
 * RUBY, not the accent purple the shell's other primaries wear.
 *
 * This button leaves the Shop. The design gives the hand-off the brand's red rather than the purple that
 * every in-app confirmation uses, so the one control that navigates away does not look like the ones that
 * commit something here.
 */
export const Primary = styled.a`
  ${cta};
  border: 0;
  background: ${colors.dclRed};
  color: ${colors.softWhite};
  text-decoration: none;

  &:hover {
    filter: brightness(1.08);
  }
`

// A 24px slot around the chevron leaf, as the design frames it.
export const PrimaryChevron = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;

  .ico {
    width: 100%;
    height: 100%;
  }
`
