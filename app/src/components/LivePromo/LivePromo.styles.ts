import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

// Live promo tile. The rounded card (CardBg) is inset from the wrapper's top by --lp-crest, and the
// avatar spans the FULL wrapper — so its head rises past the card's top edge (the Figma outfit-card
// crest), while the sides stay clipped by the card. The crest only opens in live mode (data-crest);
// the static fallback keeps the full-bleed tile.
export const Tile = styled(Link)`
  --lp-crest: 0%;
  position: relative;
  display: block;
  aspect-ratio: 867 / 386;

  &[data-crest] {
    --lp-crest: 9%;
  }
`

// The visible card: the fitting room's animated backdrop (or its resting gradient while the WebGL
// chunk loads) clipped to the rounded frame.
export const CardBg = styled.div`
  position: absolute;
  top: var(--lp-crest);
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: ${radius.banner};
  overflow: hidden;
  background: radial-gradient(circle at 50% 45%, #bf00ff 0%, #510884 78%);
  box-shadow: 0 2.5px 6.875px rgba(0, 0, 0, 0.25);
`

// The static promo art — the placeholder while the live preview boots, and the permanent art on
// mobile / when the preview fails. Fades out once the avatar is ready.
export const Fallback = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.4s ease;
  /* Sits above Inner; without this the (often invisible) art steals hover from the CTA pill. */
  pointer-events: none;

  &[data-hidden] {
    opacity: 0;
  }
`

// Right half of the wrapper (crest included): the animated avatar. pointer-events off so the whole
// tile stays one click (the Link) and the iframe never hijacks scroll/drag.
export const Avatar = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 55%;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s ease;

  &[data-ready] {
    opacity: 1;
  }

  & iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
`

export const Inner = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  padding: 0 48px;
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;

  &[data-ready] {
    opacity: 1;
  }

  ${media.maxWidth('mobile')} {
    padding: 0 24px;
    gap: 14px;
  }
`

export const Title = styled.h3`
  margin: 0;
  max-width: 55%;
  color: ${colors.white};
  font-size: clamp(20px, 2.2vw, 34px);
  font-weight: 800;
  line-height: 1.15;
  text-transform: uppercase;
  /* The copy carries an explicit \\n — the two-row break is part of the design, not a wrap. */
  white-space: pre-line;
`

// Flare CTA pill, visually a button — the whole tile is the link. Inner disables pointer events;
// the pill re-enables them so its hover ring can fire (clicks still bubble to the tile Link).
export const Cta = styled.span`
  pointer-events: auto;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 18px;
  border-radius: ${radius.btn};
  background: linear-gradient(180deg, #ff7439 0%, #ff2d55 100%);
  color: ${colors.softWhite};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: filter 0.15s ease;

  /* Same hover ring as the nav's GET CREDITS: a gradient stroke OUTSIDE the pill with a gap the page
     shows through — masked, since a plain outline can't take a gradient. */
  &::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: calc(${radius.btn} + 6px);
    padding: 2px;
    background: linear-gradient(180deg, #ff7439 0%, #ff2d55 100%);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  &:hover {
    filter: brightness(1.08);
  }
  &:hover::before {
    opacity: 1;
  }
`
