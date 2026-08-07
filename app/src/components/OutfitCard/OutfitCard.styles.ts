import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { theme } from '~/styles/theme'

const { colors } = theme

// The rail item matches the 1080×1600 thumbnail export (27:40). The visible card is the item's bottom
// 3:4 (the Figma card proportion): 1 − (3/4)/(40/27) leaves exactly 10% of transparent headroom on
// top, which the look's head/halo crests above.
const CARD_TOP = '10%'
const CARD_RADIUS = '15px'

// Dissolves the lower third into darkness so the revealed info panel reads on any gradient,
// pale stops included. Neutral black by design (the Figma scrim), NOT derived from the outfit's colors.
const SCRIM = 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 80%)'

// A transparent box, taller than the visible card by the headroom, that deliberately does NOT clip: the
// hover stroke paints just outside it and the head grows upward past the card's top edge.
//
// The resting card is artwork + the outfit's own bottom fade. Hover — or focus-within, so a keyboard
// user tabbing to the CTA sees what they focused — crossfades that fade into the neutral dark scrim
// and reveals the info panel ([data-card-reveal]). Devices with no hover (touch) show the panel AND
// the scrim persistently (over the fade) — the :hover rules still live behind (hover: hover) so a
// tap's sticky hover can't re-trigger transitions.
export const Card = styled(Link)`
  position: relative;
  display: block;
  aspect-ratio: 27 / 40;
  color: inherit;

  // No headroom on phones: cresting above the card is a desktop effect, and here it only put a strip of
  // empty page between the heading and the card. 5/6 is the 3/4 item with those 10% taken off, so the item
  // IS the card.
  ${theme.media.maxWidth('mobile')} {
    aspect-ratio: 5 / 6;
  }

  [data-card-reveal],
  [data-card-scrim] {
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  [data-card-fade] {
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  @media (hover: hover) {
    &:hover [data-card-frame] {
      outline-color: ${colors.dclRed};
    }
    &:hover [data-card-media] {
      transform: scale(1.035);
    }
    &:hover [data-card-reveal] {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover [data-card-scrim] {
      opacity: 1;
    }
    &:hover [data-card-fade] {
      opacity: 0;
    }
  }

  // Same stroke the pointer gets — a keyboard user is being shown the same state, so it cannot be a
  // different colour.
  &:focus-within [data-card-frame] {
    outline-color: ${colors.dclRed};
  }
  &:focus-within [data-card-media] {
    transform: scale(1.035);
  }
  &:focus-within [data-card-reveal] {
    opacity: 1;
    pointer-events: auto;
  }
  &:focus-within [data-card-scrim] {
    opacity: 1;
  }
  &:focus-within [data-card-fade] {
    opacity: 0;
  }

  @media (hover: none) {
    [data-card-reveal] {
      opacity: 1;
      pointer-events: auto;
    }
    // The panel is persistent here, so its legibility layer is too — the color fade alone is not
    // enough ink on pale gradients.
    [data-card-scrim] {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &:hover [data-card-media],
    &:focus-within [data-card-media] {
      transform: none;
    }
    [data-card-reveal],
    [data-card-scrim],
    [data-card-fade] {
      transition: none;
    }
  }
`

// The visible card: the creator's gradient, applied inline (per-outfit data, not a token).
export const Frame = styled.div`
  position: absolute;
  top: ${CARD_TOP};
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: ${CARD_RADIUS};
  background: ${colors.media};

  ${theme.media.maxWidth('mobile')} {
    top: 0;
  }
  // The hover stroke (Figma 2090:402143): 2px, a 2px breath outside the card's edge. An outline rather
  // than a border so it costs no layout, and it paints with the Frame — i.e. BEHIND the thumbnail, so the
  // cresting head occludes it exactly like the design.
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.2s ease;
`

// Clips the look left, right and bottom (matching the card's rounded corners) but leaves the TOP OPEN so
// the head overflows above the card and keeps growing upward on hover instead of being cut off.
export const Mask = styled.div`
  position: absolute;
  inset: 0;
  clip-path: inset(-1000px 0 0 0 round 0 0 ${CARD_RADIUS} ${CARD_RADIUS});
  pointer-events: none;

  // Nothing to crest into once the card fills the item, so close the top rather than let the head spill
  // over the heading above.
  ${theme.media.maxWidth('mobile')} {
    clip-path: inset(0 round ${CARD_RADIUS});
  }
`

export const Thumb = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  // Zoom from the centre (not the feet) so the head rises only half as much and stays inside the rail's
  // small top overflow.
  transform-origin: 50% 50%;
  user-select: none;
  transition: transform 0.2s ease;

  ${theme.media.maxWidth('mobile')} {
    // The shorter card crops the 27:40 export — from the BOTTOM only, keeping the head where it is.
    object-position: top;
  }
`

// The resting overlay: the outfit's own bottom color ramping 0 → 80%, dissolving the legs into the
// card (per-outfit data, applied inline via outfitFade()).
export const Fade = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 0 0 ${CARD_RADIUS} ${CARD_RADIUS};
`

export const Scrim = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 0 0 ${CARD_RADIUS} ${CARD_RADIUS};
  background: ${SCRIM};
`

// Name + count on the left, the live total on the right, the CTA across the bottom — all white on the
// scrim, so no text-shadow is needed even on pale gradients.
export const Body = styled.div`
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: ${colors.white};
`

// Name and count stack on the left with the total centred against them on the right (the Figma
// arrangement). On the narrow rail cards the total would crush the name to a few characters, so
// below the mobile breakpoint the name takes the full first row and the total drops beside the count.
export const TopRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 6px;
  align-items: center;
`

export const Name = styled.h3`
  grid-column: 1;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${theme.media.maxWidth('mobile')} {
    font-size: 15px;
  }
`

export const Meta = styled.div`
  grid-column: 1;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Price = styled.div`
  grid-column: 2;
  grid-row: 1 / span 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 17px;
  font-weight: 600;

  ${theme.media.maxWidth('mobile')} {
    grid-row: 2;
    font-size: 15px;
  }
`

export const Cta = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  border-radius: 12px;
`
