import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

// How long a skeleton takes to dissolve into the content that replaced it. Exported because the
// component unmounts the fading layer on the same timing (see SkeletonCards.tsx).
export const SETTLE_MS = 250

// The outfit placeholder's fill, the same surface as every `.skeleton` elsewhere in the app through the two
// custom properties (styles/index.css). The item card has its own drawn loading state (SkeletonCard).
const shimmerFill = `
  background: linear-gradient(
    100deg,
    var(--skeleton-lo) 30%,
    var(--skeleton-hi) 50%,
    var(--skeleton-lo) 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
`

// A card-shaped placeholder, the design's loading card, sized to the real AssetCard so a loading
// grid/rail holds its eventual height: 300px, or 250px for the compact card below sm. Both are AssetCard's
// own fixed heights, restated rather than imported because a card height is that component's geometry,
// not a token; keep them in step by measuring the real card.
export const SkeletonCard = styled.div`
  min-height: 300px;
  display: flex;
  flex-direction: column;
  border-radius: ${radius.tile};
  background: ${colors.overlay};
  animation: skeleton-pulse 1.4s ease-in-out infinite;

  ${media.maxWidth('sm')} {
    min-height: 250px;
  }

  @keyframes skeleton-pulse {
    50% {
      opacity: 0.6;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// The violet wash the loading tile and its bars share, fading toward the right.
const loadingWash = `linear-gradient(to left, ${colors.loadingWashFaint}, ${colors.loadingWash})`

export const SkeletonThumb = styled.div`
  flex: 1;
  min-height: 0;
  border-radius: ${radius.tile};
  background: ${loadingWash};
`

export const SkeletonInfo = styled.div`
  flex: 0 0 112px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 16px;

  ${media.maxWidth('sm')} {
    flex-basis: 114px;
  }
`

export const SkeletonBar = styled.div`
  width: 100%;
  height: 20px;
  border-radius: ${radius.pill};
  background: ${loadingWash};

  &[data-short] {
    width: 140px;
    max-width: 75%;
    height: 14px;
  }
`

// An OUTFIT-shaped placeholder ("Shop the look"), sized to the real OutfitCard: a 27:40 box whose visible
// card is its bottom 90% on desktop, and below mobile a 5:6 box that IS the card (no headroom there).
// Restated rather than imported because that is the card's geometry, not tokens; the e2e measuring one
// against the other is what keeps them in step.
export const SkeletonOutfitCard = styled.div`
  position: relative;
  aspect-ratio: 27 / 40;

  ${media.maxWidth('mobile')} {
    aspect-ratio: 5 / 6;
  }

  &::after {
    content: '';
    position: absolute;
    top: 10%;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 15px;
    ${shimmerFill};
  }

  /* No headroom below mobile, so the fill covers the whole box (OutfitCard.styles). */
  ${media.maxWidth('mobile')} {
    &::after {
      top: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }
`

/**
 * The skeletons' exit: the placeholder rail laid OVER the cards that replaced it, fading out.
 *
 * The same crossfade AssetCard makes when its flat thumbnail dissolves into the 3D preview
 * (AssetCard.styles Img + data-hidden) — the outgoing layer stays visible over the incoming content and
 * fades, instead of the two swapping in a single frame. Absolutely positioned, so it is out of flow and
 * costs no layout (the height is held by the real cards underneath), and pointer-events: none so those
 * cards stay clickable the whole time it is on screen.
 *
 * Deliberately geometry-FREE: the caller puts its own rail (the very styled track it uses for the real
 * cards) inside, so the fading copy cannot drift from the rail it covers at any breakpoint.
 */
export const SkeletonSettleLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
  animation: skeleton-settle ${SETTLE_MS}ms ease forwards;

  @keyframes skeleton-settle {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  /* Someone who asked for less motion gets the plain swap: the space was already reserved by the
     skeletons, so there is nothing left for a fade to smooth over. */
  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`
