import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

export const Root = styled.section`
  margin-top: 56px;
`

export const Head = styled.div`
  margin-bottom: 18px;
`

export const Title = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${colors.softWhite};
`

export const Sub = styled.p`
  margin-top: 4px;
  font-size: 13px;
  color: rgba(252, 252, 252, 0.62);
`

/** The column's width, like the carousels above it; the band itself is one rounded block of photographs. */
export const Strip = styled.div`
  position: relative;
  border-radius: ${radius.card};
  overflow: hidden;
`

export const Track = styled.div`
  display: flex;
  gap: 0;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  /* An end that has more band behind it dissolves instead of being cut, and an end that does not stays
     sharp — otherwise the first photo's own caption sits under a fade that means nothing. A mask rather
     than a gradient overlay, because the page behind is a gradient of its own and a solid fade would
     band against it. */
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    #000 var(--fade-start, 5%),
    #000 var(--fade-end, 95%),
    transparent 100%
  );

  &[data-at-start] {
    --fade-start: 0%;
  }
  &[data-at-end] {
    --fade-end: 100%;
  }

  &::-webkit-scrollbar {
    display: none;
  }
`

/**
 * A portrait frame, cropped from the 16:9 original. Camera reel photos are wide shots of a whole scene,
 * so the middle is where the avatar is and the sides are scenery — taking the centre is what makes the
 * item visible at this size.
 */
export const Tile = styled.button`
  position: relative;
  flex: 0 0 auto;
  height: 380px;
  aspect-ratio: 4 / 5;
  padding: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  scroll-snap-align: center;
  cursor: pointer;
  background: ${colors.media};

  ${media.maxWidth('lg')} {
    height: 300px;
  }
  ${media.maxWidth('mobile')} {
    height: 240px;
  }

  /* At rest the band reads as one continuous image; the hovered frame lifts out of it. */
  & img {
    transition:
      transform 0.5s ease,
      filter 0.3s ease;
    filter: saturate(0.92) brightness(0.88);
  }
  &:hover img,
  &:focus-visible img {
    transform: scale(1.06);
    filter: none;
  }

  @media (prefers-reduced-motion: reduce) {
    & img {
      transition: none;
    }
    &:hover img {
      transform: none;
    }
  }
`

export const Thumb = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`

// Held back until the frame is hovered, so the band stays photographs and not captions. Touch has no
// hover, so there it is simply always on.
export const Meta = styled.span`
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 28px 12px 12px;
  text-align: left;
  background: linear-gradient(to top, rgba(12, 10, 16, 0.9), rgba(12, 10, 16, 0));
  opacity: 1;
  transition: opacity 0.25s ease;

  @media (hover: hover) {
    opacity: 0;

    button:hover &,
    button:focus-visible & {
      opacity: 1;
    }
  }
`

// The shooter's avatar face. Two sizes: on a frame in the strip, and on the open photo's bar.
const faceBase = `
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex: none;
  border: 1.5px solid rgba(255, 255, 255, 0.85);

  &[data-size='lg'] {
    width: 34px;
    height: 34px;
  }
`

export const Face = styled.img`
  ${faceBase};
  object-fit: cover;
  background: ${colors.media};
`

// Fallback for a profile with no face deployed: their initial on a colour derived from the address.
export const FaceLetter = styled.span`
  ${faceBase};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${colors.white};
  font-size: 12px;
  font-weight: 700;
  line-height: 1;

  &[data-size='lg'] {
    font-size: 15px;
  }
`

export const Names = styled.span`
  display: block;
  min-width: 0;
`

export const Who = styled.span`
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-size='lg'] {
    font-size: 15px;
  }
`

export const Where = styled.span`
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

// Floating over the band's own edges. They fade in with the band so the resting state is only photographs.
export const Nav = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
  transition:
    opacity 0.2s ease,
    transform 0.15s ease;

  & img {
    display: block;
    width: 100%;
    height: 100%;
  }
  &[data-side='left'] {
    left: 16px;
  }
  &[data-side='right'] {
    right: 16px;
  }
  &[data-side='left'] img {
    transform: scaleX(-1);
  }
  &:hover {
    transform: translateY(-50%) scale(1.07);
  }
  &:disabled {
    pointer-events: none;
  }

  /* Only on a pointer device, and only while the band is under it. A disabled arrow (the strip is
     already at that end) is excluded here rather than hidden afterwards, which would need to outrank
     this selector. */
  @media (hover: hover) {
    [data-photo-strip]:hover > &:not(:disabled),
    &:focus-visible:not(:disabled) {
      opacity: 1;
    }
  }
  ${media.maxWidth('mobile')} {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const Lightbox = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(10, 8, 14, 0.88);
  display: grid;
  place-items: center;
  padding: 24px;

  ${media.maxWidth('mobile')} {
    padding: 12px;
  }
`

export const Big = styled.div`
  width: min(1040px, 100%);
  border-radius: ${radius.card};
  overflow: hidden;
  background: ${colors.text2};
`

export const BigStage = styled.div`
  position: relative;
  overflow: hidden;
`

// The lightbox shows the WHOLE frame: the strip crops to make the avatar readable, and opening a photo
// is how the shopper gets the scene back. Click to zoom into the point clicked — in a wide shot of a
// whole scene the item can be a few dozen pixels, and this is the only way to actually look at it.
export const BigImg = styled.img`
  position: relative;
  width: 100%;
  display: block;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  cursor: zoom-in;
  opacity: 0;
  transition:
    transform 0.28s ease,
    opacity 0.18s ease;

  &[data-ready] {
    opacity: 1;
  }

  &[data-zoom] {
    transform: scale(2.6);
    cursor: zoom-out;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

// The strip's own thumbnail, held under the full-size photo: it is already cached, so it paints on the
// same frame as the click and the photo sharpens into place instead of arriving out of a black hole.
export const BigThumb = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0b0910;
  filter: blur(6px);
  transform: scale(1.02);
  transition: opacity 0.18s ease;

  &[data-hidden] {
    opacity: 0;
  }
`

export const BigArrow = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 53px;
  height: 53px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
  transition: transform 0.15s ease;

  & img {
    display: block;
    width: 100%;
    height: 100%;
  }
  &[data-side='left'] {
    left: 8px;
  }
  &[data-side='right'] {
    right: 8px;
  }
  &[data-side='left'] img {
    transform: scaleX(-1);
  }
  &:hover {
    transform: translateY(-50%) scale(1.07);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
  ${media.maxWidth('mobile')} {
    width: 40px;
    height: 40px;
  }
`

export const BigBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
`

// Where and when, and how far through the set — everything that is about the photograph rather than
// about the people in it, pushed to the far end of the bar.
export const BigMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  min-width: 0;
  font-size: 12px;
  color: ${colors.muted2};
`

export const PlaceLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${colors.softWhite};
  text-decoration: none;
  border-radius: ${radius.pill};
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.15s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
    text-decoration: underline;
  }
`

export const When = styled.span`
  white-space: nowrap;
`

export const Counter = styled.span`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.7;
`

// The people in the shot: who is wearing the item, then who took the picture.
export const Credit = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`

export const CreditLink = styled.a`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-decoration: none;
  border-radius: ${radius.pill};
  padding: 4px 12px 4px 4px;
  margin-left: -4px;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

export const CreditText = styled.span`
  display: block;
  min-width: 0;
`

// "Worn by" / "Photo by": the label is the quiet half, the name is the one being read.
export const CreditLabel = styled.span`
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${colors.muted2};
`

export const CreditName = styled.span`
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: ${colors.white};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

// The photographer, when they are not the one wearing it: a credit, so it sits a step down from the
// name above and keeps its label inline.
export const PhotoBy = styled.a`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: ${colors.muted2};
  text-decoration: none;
  white-space: nowrap;

  & > span {
    display: inline;
  }
  &:hover {
    color: ${colors.softWhite};
    text-decoration: underline;
  }
`

export const Close = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  background: rgba(12, 10, 16, 0.55);
  backdrop-filter: blur(4px);
  color: ${colors.white};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(12, 10, 16, 0.8);
  }
`
