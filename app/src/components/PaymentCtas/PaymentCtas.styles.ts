import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Purchase CTAs for the payment rails (Figma 1558-320257 "CTAs" → 1558-320267 "Button", plus the
// exchange-rate caption 1653-368866). The MANA/mixed buttons are the design's soft-black-2 (#242129)
// 56px pill with a 12px radius; the credits button keeps the shop's amethyst primary so the default
// rail stays visually primary.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  width: 100%;
`

// Shared button metrics — identical geometry/typography for every rail so a stack of two reads as a set.
const buttonBase = `
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    filter 0.15s ease;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  color: ${theme.colors.softWhite};

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

/**
 * The primary purchase rail (Figma 1551-315504). Carries the shared `buyBtn` gradient — the Figma style
 * literally named "BUY Button" — rather than the amethyst it used to have, so the button that takes the
 * money looks the same here as it does on GET CREDITS and the promo CTAs.
 *
 * Everything else the node specifies (radius 12, padding, 15px/24 semibold, 0.46px uppercase) already
 * comes from `buttonBase`; the background is the whole delta.
 */
export const CreditsBtn = styled.button`
  ${buttonBase}
  background: ${theme.gradients.buyBtn};

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
`

// The dark rail's hover is a defined colour in the design (node 738:53264 "Button / status=Hover" →
// neutrals/gray-0), not a brightness lift — a filter on #242129 washes toward grey-blue instead.
export const ManaBtn = styled.button`
  ${buttonBase}
  background: ${theme.colors.text2};

  &:hover:not(:disabled) {
    background: ${theme.colors.gray0};
  }
`

// The amount block inside a button: mark + number at 20px (Figma), separate from the 15px label.
export const Amount = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-transform: none;
  letter-spacing: 0;

  span {
    font-size: 20px;
    font-weight: 600;
    line-height: normal;
  }
  .ico {
    width: 24px;
    height: 24px;
    background: ${theme.colors.softWhite};
  }
`

// The MANA mark keeps the design's two-box geometry (node 1558:320284): a 30px slot with the 24px glyph
// pinned to its top-left. Collapsing it to a flat 24px would shift the amount 6px left of the design and
// drop the optical lead-in the 30px slot gives the number beside it.
export const ManaMark = styled.span`
  position: relative;
  display: block;
  width: 30px;
  height: 30px;
  flex: none;

  /* Centred in the slot, not pinned to its top: the slot is taller than the glyph and sits next to a
     vertically centred amount, so a top-pinned mark reads as floating above the number. */
  img {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: block;
  }
`

// Explicit "MANA" unit next to the MANA leg of a mixed payment.
export const Unit = styled.span`
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.85;
`

// "+" between the two legs of a mixed payment.
export const Plus = styled.span`
  font-size: 18px;
  font-weight: 600;
  opacity: 0.7;
`

// "1 credit = X MANA" (Figma 1653-368866): Inter Regular 12, gray-2, tight leading.
export const RateNote = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 12px;
  line-height: 1;
  color: ${theme.colors.muted};
  text-align: center;
`

// Why the disabled MANA button can't be used. Sits directly under it (not with the rate note) because it
// explains that one button, and it needs two lines of room at narrow widths — hence the 1.4 leading.
export const ShortfallNote = styled.p`
  margin: -4px 0 0;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 12px;
  line-height: 1.4;
  color: ${theme.colors.muted};
  text-align: center;
`
