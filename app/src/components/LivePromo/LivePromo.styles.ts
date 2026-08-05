import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

// Live promo tile: same footprint as the static Promo it replaces, but the art is a real avatar
// performing a look/emote (wearable-preview iframe) over the fitting room's animated WebGL backdrop.
// The gradient is the backdrop's resting look while its chunk loads.
export const Tile = styled(Link)`
  position: relative;
  display: block;
  aspect-ratio: 867 / 386;
  border-radius: ${radius.banner};
  overflow: hidden;
  background: radial-gradient(circle at 50% 45%, #bf00ff 0%, #510884 78%);
  filter: drop-shadow(0 2.5px 6.875px rgba(0, 0, 0, 0.25));
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

  &[data-hidden] {
    opacity: 0;
  }
`

// Right half of the tile: the animated avatar. pointer-events off so the whole tile stays one click
// (the Link) and the iframe never hijacks scroll/drag.
export const Avatar = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 55%;
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
  z-index: 1;
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
`

// Flare CTA pill, visually a button — the whole tile is the link.
export const Cta = styled.span`
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
`
