import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// The rail item matches the 1080×1600 avatar export (27:40). The card fills the item below this strip of
// transparent headroom on top, which the avatar's head/halo crests above.
const CARD_TOP = '6.5625%'

// The rail item: a transparent box, taller than the visible card by the headroom. It does NOT clip, so
// the hover stroke on the card can paint just outside it.
export const Card = styled.div`
  position: relative;
  aspect-ratio: 27 / 40;

  &:hover [data-testid='card-frame'] {
    outline-color: #cccccc;
  }
  &:hover [data-testid='card-media'] {
    transform: scale(1.035);
  }
  // Reveal the add-to-cart button on hover; on touch (no hover) keep it always visible so it stays usable.
  &:hover [data-testid='avatar-add'] {
    opacity: 1;
    transform: translateY(0);
  }
  @media (hover: none) {
    [data-testid='avatar-add'] {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &:hover [data-testid='card-media'] {
      transform: none;
    }
  }
`

// The visible card: the per-card background gradient (the full CSS gradient arrives via --g-frame)
// filling the bottom 85% of the item — darker at the top, vivid at the bottom. The hover stroke traces
// this rectangle.
export const Frame = styled.div`
  position: absolute;
  top: ${CARD_TOP};
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 15px;
  background: var(--g-frame, linear-gradient(180deg, #14161b, #2a2a2e));
  // Hover frame: a 3px stroke sitting a few px OUTSIDE the card (offset), coloured in on hover. Outline
  // (not box-shadow) so it traces the rounded card with a clean gap.
  outline: 3px solid transparent;
  outline-offset: 6px;
  transition: outline-color 0.2s ease;
`

// Clips the avatar to the card on the left, right and bottom (bottom corners rounded to match the card)
// but leaves the TOP OPEN — so the head overflows above the card, and keeps growing upward on hover
// instead of being cut off. Sits above the Frame.
export const Mask = styled.div`
  position: absolute;
  inset: 0;
  clip-path: inset(-1000px 0 0 0 round 0 0 15px 15px);
  pointer-events: none;
`

// Bottom fade: a front overlay (above the avatar) over the lower ~37.5% of the card — transparent at the
// top, fading to the card's own colour (--g-fade) at the bottom, dissolving the legs into the card
// instead of a hard crop line.
export const Fade = styled.div`
  position: absolute;
  top: 62.5%;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 0 0 15px 15px;
  background: linear-gradient(180deg, transparent, var(--g-fade, rgba(0, 0, 0, 0.8)));
  pointer-events: none;
`

// The avatar PNG is pre-framed to the 1080×1600 (27:40) item — head near the top, legs cropping at the
// bottom — so it simply fills the item; the head crests above the card because the card starts below it
// (CARD_TOP headroom). Scales up from the bottom on hover, growing into the open top (not clipped).
export const Image = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  // Zoom from the centre (not the feet) on hover so the head rises only half as much — it stays within
  // the rail's small top overflow instead of being clipped.
  transform-origin: 50% 50%;
  user-select: none;
  transition: transform 0.2s ease;
`

// "Add to cart" button — the app's dark secondary action, a near-full-width bar across the card's lower
// edge, revealed on hover (always shown on touch — see Card).
export const AddButton = styled.button`
  position: absolute;
  left: 4.5%;
  right: 4.5%;
  bottom: 5%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: ${radius.btn};
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  font-weight: 600;
  font-size: 13px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    background 0.15s ease;

  &:hover:not(:disabled) {
    color: ${colors.text2};
    background: ${colors.softWhite};
  }
  &[data-state='done'] {
    background: ${colors.okStrong};
    cursor: default;
  }
  &:disabled {
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: opacity 0.18s ease;
    transform: none;
  }
`
