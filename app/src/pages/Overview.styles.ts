import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors, radius, media } = theme

// Empty/crash state — also reused by App's CrashFallback.
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 80px 20px;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 10px;
`

// Figma hero CTA: the purple button trimmed to the 40px hero spec.
export const HeroCta = styled(Button)`
  height: 40px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
`

// The page scopes an override of the shared rail (RecentlyViewed / FollowedCreators render Row.Track,
// which carries data-rail) so every rail on this page shows the same fixed-N-per-view card width as the
// carousels.
export const Overview = styled.div`
  & [data-rail] {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc((100% - 64px) / 5);
    padding: 12px 0;
    margin: 0;
    // Hide the native scrollbar so these discovery rails match the carousels above (which also hide
    // it) — otherwise the home page shows one rail with a grey scrollbar and the rest without.
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  & [data-rail]::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  ${media.maxWidth('xl')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 48px) / 4);
    }
  }
  ${media.maxWidth('lg')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 32px) / 3);
    }
  }
  ${media.maxWidth('sm')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 16px) / 2);
    }
  }
`

// Full-bleed rounded banner: the art is a single background image, title + CTA overlaid on the left.
export const Hero = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  aspect-ratio: 1721 / 304;
  max-height: 340px;
  margin-bottom: 40px;
  overflow: hidden;
  border-radius: ${radius.banner};
  background: #14161b;

  ${media.maxWidth('mobile')} {
    aspect-ratio: auto;
    min-height: 200px;
    max-height: none;
  }
`

export const HeroBg = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center right;
`

// Left-to-right dark scrim so the title + CTA keep AA contrast over the busy art at every width.
export const HeroScrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, rgba(10, 11, 14, 0.78) 0%, rgba(10, 11, 14, 0.45) 38%, rgba(10, 11, 14, 0) 68%);
`

export const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  padding: 0 64px;

  ${media.maxWidth('mobile')} {
    padding: 0 24px;
  }
`

export const HeroTitle = styled.h1`
  margin: 0;
  color: ${colors.white};
  font-size: clamp(24px, 3.2vw, 36px);
  font-weight: 700;
  line-height: 1.235;
  text-transform: uppercase;
`

// Two side-by-side promo banners, stacking to one column on mobile.
export const Promos = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 0 0 40px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
  }
`

export const Promo = styled(Link)`
  display: block;
  border-radius: ${radius.banner};
  overflow: hidden;
  filter: drop-shadow(0 2.5px 6.875px rgba(0, 0, 0, 0.25));

  & img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 867 / 386;
    object-fit: cover;
  }
`
