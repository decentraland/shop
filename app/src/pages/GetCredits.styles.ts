import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

// Gradient strokes are painted as masked pseudo-elements (CSS cannot gradient-fill a `border`): the layer is
// filled edge to edge, then this mask keeps only the `padding`-wide rim by excluding the content box.
const RING_MASK = `linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)`

// Get credits page (Figma 1654-374586). The pack picker lives inside ONE full-bleed purple card
// (Figma 1654-374620) that holds the heading and the pack row; the post-checkout states below stay on
// the light page, where their own Figma frames (1208-242158 / 1208-243058) put them.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

// The pack picker sits on a darkened band (Figma 1654:374619) — the page's purple field with 20% black
// over it — which is what divides this section from the FAQ on the plain field below.
export const Hero = styled.section`
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 82px clamp(16px, 7.06%, 122px) 129px;

  /* Full-bleed and flush against the sub-nav, so it cancels the shell's gutter and top padding — a
     background on the section itself would stop at the .page container's edges. */
  &::before {
    content: '';
    position: absolute;
    z-index: -1;
    top: -28px;
    bottom: 0;
    left: 50%;
    width: 100vw;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.2);
  }

  ${theme.media.maxWidth('lg')} {
    padding: 48px 24px 56px;
  }
  ${theme.media.maxWidth('mobile')} {
    padding: 32px 16px 40px;

    &::before {
      top: -16px;
    }
  }
`

/* Holds the pack panel and the redirect overlay together, so the overlay's `inset: 0` measures THIS box
   rather than the whole hero — the FAQ below must not pull the centred spinner down with it. No z-index or
   isolation here on purpose: the overlay's `z-index: 1` still resolves against the hero's stacking
   context. */
export const HeroPanel = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
`

/* The buyer FAQ, below the band on the plain page field (Figma 2106:416524). It starts 79px under the
   band's edge; Root's 24px gap covers part of that, so only the remainder is stated here. */
export const FaqBlock = styled.div`
  width: 100%;
  max-width: 1478px;
  margin: 0 auto;
  margin-top: 55px;

  &:focus {
    outline: none;
  }

  ${theme.media.maxWidth('lg')} {
    margin-top: 24px;
  }
  ${theme.media.maxWidth('mobile')} {
    margin-top: 8px;
  }
`

/* `$hidden` uses visibility, NOT display/unmount, while the Stripe redirect status shows over it: the panel
   must keep the exact height it had with the grid in it, or the footer jumps up for that moment. It also
   drops the hidden pack buttons out of the tab order. */
export const HeroInner = styled.div<{ $hidden?: boolean }>`
  width: 100%;
  max-width: 1478px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 52px;
  ${({ $hidden }) => $hidden && 'visibility: hidden;'}

  ${theme.media.maxWidth('lg')} {
    gap: 32px;
  }
`

export const Head = styled.header`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: center;

  ${theme.media.maxWidth('mobile')} {
    gap: 12px;
  }
`

export const Title = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 40px;
  font-weight: 700;
  line-height: 1.167;
  color: ${theme.colors.white};

  ${theme.media.maxWidth('mobile')} {
    font-size: 32px;
  }
`

export const SubRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
`

export const Sub = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 24px;
  font-weight: 500;
  line-height: 1.334;
  color: ${theme.colors.media};

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const Learn = styled.button`
  appearance: none;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 500;
  line-height: 30px;
  color: ${theme.colors.white};
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    opacity: 0.85;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 3px;
    border-radius: ${theme.radius.chip};
  }

  ${theme.media.maxWidth('mobile')} {
    font-size: 15px;
    line-height: 22px;

    .ico {
      width: 18px;
      height: 18px;
    }
  }
`

export const Note = styled.p`
  margin: 0;
  padding: 10px 16px;
  border-radius: ${theme.radius.btn};
  background: rgba(21, 21, 21, 0.4);
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.colors.media};
  text-align: center;
`

// minmax(0, …) so the fixed-width artwork can't push the tracks past the container and get clipped.
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  width: 100%;

  /* Two per row from tablet all the way down to the narrowest phone (Figma node 1654-374664): one
     full-width pack per row wastes the height and pushes the fourth option far below the fold. */
  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 40px;
  }
  @media (max-width: 520px) {
    gap: 12px;
    row-gap: 24px;
  }
`

export const PackCard = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  min-width: 0;
  padding: 24px 16px 16px;
  /* No real border in either state, so nothing about the card's box can change under the pointer — both
     strokes are painted by the masked pseudo-elements below. See the hover block for why that matters. */
  border: 0;
  border-radius: ${theme.radius.banner};
  background: rgba(21, 21, 21, 0.4);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  color: ${theme.colors.white};
  cursor: pointer;
  text-align: center;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;

  /* Both strokes are GRADIENTS, and both are painted here rather than with a border property.
     Two separate reasons, and each one alone would be enough:
     1. CSS cannot gradient-fill a border, and background-clip fights the card's translucent fill.
     2. A pseudo-element takes no part in layout. A real border that grows 1px → 5px on hover pulls 4px off
        the content box (box-sizing is border-box), so the card's artwork and price shrank as the pointer
        crossed it, which in a row of four made the hovered card visibly smaller than its neighbours.
     The flat #ffbc5b / #ff2d55 that Figma's code export reports for these strokes are not the design: the
     export cannot represent a gradient stroke, so it emits one stop. The give-away is the mobile variant,
     which reports #c640cd — Flare's LAST stop where desktop reports its FIRST. The page-level frame
     (1654:374620) renders both cards with a warm gradient edge, which is what these two rules paint. */
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    -webkit-mask: ${RING_MASK};
    -webkit-mask-composite: xor;
    mask: ${RING_MASK};
    mask-composite: exclude;
    transition: opacity 0.15s ease;
  }
  /* Resting hairline: 1px of Flare. */
  &::before {
    padding: 1px;
    background: ${theme.gradients.flare};
  }
  /* Hover: the same edge at the 5px the design gives the selected card, in the warm half of the ramp. */
  &::after {
    padding: 5px;
    background: ${theme.gradients.ember};
    opacity: 0;
  }

  &:hover,
  &:focus-visible,
  &:active {
    background: ${theme.colors.accent};
    box-shadow: 0 0 8px ${theme.colors.brandViolet};
  }
  &:hover::before,
  &:focus-visible::before,
  &:active::before {
    opacity: 0;
  }
  &:hover::after,
  &:focus-visible::after,
  &:active::after {
    opacity: 1;
  }
  &:focus-visible {
    outline: none;
  }

  /* Loading placeholder shell — same card, none of the interaction. */
  &[data-skeleton='true'] {
    cursor: default;
  }
  &[data-skeleton='true']:hover {
    background: rgba(21, 21, 21, 0.4);
    box-shadow: none;
  }
  &[data-skeleton='true']:hover::before {
    opacity: 1;
  }
  &[data-skeleton='true']:hover::after {
    opacity: 0;
  }

  /* Figma 1654:372759 — the mobile card is its own set of metrics, not a scaled-down desktop one. The
     stroke stays the same Flare hairline: the export's #c640cd for this variant is that gradient's last
     stop, not a second colour. */
  ${theme.media.maxWidth('mobile')} {
    gap: 12px;
    padding: 8px;
    border-radius: 16px;
  }
`

export const PackBadge = styled.span`
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 6px 8px;
  border-radius: ${theme.radius.pill};
  background: ${theme.gradients.flare};
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 500;
  line-height: 24px;
  color: ${theme.colors.white};
  white-space: nowrap;

  .ico {
    width: 24px;
    height: 24px;
  }

  /* Figma 1658:375459 — the mobile badge is not the desktop one scaled: it sits 9px above the card, not 18,
     and its padding is symmetric. */
  ${theme.media.maxWidth('mobile')} {
    top: -9px;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 18px;

    .ico {
      width: 18px;
      height: 18px;
    }
  }
`

// Stretched to the card's content box rather than left shrink-to-fit, so the artwork's percentage width
// below resolves against the CARD. Unstretched, this column is only as wide as its widest text, and a
// percentage of that is a number with no relationship to the card at all.
export const PackTop = styled.span`
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 32px;

  ${theme.media.maxWidth('mobile')} {
    padding-top: 24px;
  }
`

export const PackHeading = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
`

// The currency mark keeps the amount's own colour (soft white here) — never an accent tint.
export const PackAmountRow = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;

  .ico {
    width: 28.21px;
    height: 29.79px;
    color: ${theme.colors.softWhite};
  }

  ${theme.media.maxWidth('mobile')} {
    .ico {
      width: 23.5px;
      height: 24.81px;
    }
  }
`

// Figma trims the text box to the cap height, so the line box is shorter than the font size.
export const PackAmount = styled.span`
  font-family: ${theme.font.sans};
  font-size: 40px;
  font-weight: 800;
  line-height: 30px;
  color: ${theme.colors.white};

  ${theme.media.maxWidth('mobile')} {
    font-size: 32px;
    line-height: 24px;
  }
`

export const PackUnit = styled.span`
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 500;
  line-height: 15px;
  color: ${theme.colors.media};
  text-transform: uppercase;

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
    line-height: 12px;
  }
`

/**
 * A SHARE of the card, not a pixel size.
 *
 * Figma draws the artwork 225px wide in a 351.5px card (1654:374650) — 64% of the card, or 70% of its
 * content box once the 16px gutters are off. A literal 225px would only be right at the one width the
 * design happens to be drawn at: our cards are grid cells, so they measure ~268px at a 1440 viewport and
 * ~150px on a phone, and 225px there is wider than the card itself. The percentage is exact at the
 * design's width and stays proportional everywhere else, which also retires the old fixed-width overflow
 * this used to work around at 520px.
 *
 * `align-self: stretch` first, so the box is the content width rather than shrink-to-fit: the card is a
 * centred column, and shrink-to-fit let each pack's art take a different width (measured 118px and 152px
 * in two identical cards) and spill out of the narrow ones.
 */
export const PackArt = styled.span`
  display: block;
  width: 70%;
  aspect-ratio: 1;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* Scaling the IMG, not this box: the box holds the card's layout, so growing it would push the
       price button down and make the hovered card taller than its neighbours. */
    transform-origin: center;
    transition: transform 0.2s ease;
  }

  [data-testid='pack']:hover & img,
  [data-testid='pack']:focus-visible & img {
    transform: scale(1.08);
  }

  @media (prefers-reduced-motion: reduce) {
    img,
    [data-testid='pack']:hover & img,
    [data-testid='pack']:focus-visible & img {
      transition: none;
      transform: none;
    }
  }
`

export const PackPrice = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  /**
   * Pinned to the BOTTOM of the card.
   *
   * The artwork above it is not the same height in every pack, so laying the price out in flow put the four
   * buy buttons at different heights within one row (measured 36px apart). Pushing it down means the buttons
   * line up whatever the art does.
   */
  margin-top: auto;
  width: 100%;
  height: 56px;
  padding: 0 12px;
  border-radius: ${theme.radius.card};
  /* Translucent at rest; the card's hover/selected state below flips it to the solid white the design
     gives the chosen pack (Figma 2106:416252 vs 1654:372735). */
  background: rgba(255, 255, 255, 0.2);
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
  letter-spacing: 0.46px;
  color: ${theme.colors.softWhite};
  text-transform: uppercase;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  [data-testid='pack']:hover &,
  [data-testid='pack']:focus-visible &,
  [data-testid='pack']:active & {
    background: ${theme.colors.white};
    color: ${theme.colors.text2};
    font-size: 16px;
    font-weight: 800;
  }

  ${theme.media.maxWidth('mobile')} {
    background: ${theme.colors.white};
    color: ${theme.colors.text2};
    font-size: 16px;
    font-weight: 800;
  }
`

const shimmer = keyframes`
  to {
    background-position: -200% 0;
  }
`

const Shimmer = styled.span`
  display: block;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0.08) 30%,
    rgba(255, 255, 255, 0.2) 50%,
    rgba(255, 255, 255, 0.08) 70%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

/*
 * The three bars below stand in for PackAmountRow, PackUnit and PackArt, and each one is the size of what
 * REPLACES it — otherwise the grid resizes when the catalogue lands. Measured before this: the skeleton card
 * was 446px tall against the real card's 402px, and its art bar 236px wide against the real 165px, so the
 * whole row visibly collapsed and the artwork jumped inward. Heights track the line boxes of the real type
 * (30px amount, 15px unit), which is why they are stated in px here and shrunk on mobile like the type is.
 */
export const SkAmount = styled(Shimmer)`
  width: 60%;
  height: 30px;
  border-radius: ${theme.radius.chip};

  ${theme.media.maxWidth('mobile')} {
    height: 24px;
  }
`

// PackUnit ("CREDITS"). Without it the heading was 27px short and everything under it started too high.
export const SkUnit = styled(Shimmer)`
  width: 36%;
  height: 15px;
  border-radius: ${theme.radius.chip};

  ${theme.media.maxWidth('mobile')} {
    height: 12px;
  }
`

// Same 70%-of-the-card share PackArt uses, so the artwork lands exactly where its placeholder was.
export const SkArt = styled(Shimmer)`
  width: 70%;
  aspect-ratio: 1;
  border-radius: 16px;
`

export const SkPrice = styled(Shimmer)`
  width: 100%;
  height: 48px;
  border-radius: ${theme.radius.card};
`

export const Muted = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  color: ${theme.colors.muted};
`

/* The hand-off to Stripe, centred in the hero panel the pack grid just filled (Hero is the positioned
   ancestor). Absolute rather than in-flow so the panel keeps the exact size it had with the grid in it —
   see the `$hidden` note on HeroInner. Sits above HeroInner and below nothing else; the backdrop is z-index
   -1, so the purple artwork still shows through behind the mark. */
export const RedirectStatus = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  text-align: center;
`

export const RedirectNote = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 16px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.88);
`

const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.88);
    opacity: 0.7;
  }
`

export const Processing = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 64px 24px;
  min-height: 42vh;
`

export const ProcessingLogo = styled.img`
  width: 61px;
  height: 61px;
  animation: ${pulse} 1.2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

/* Same breathing mark as the crediting state, a touch larger — it is the only thing on the scrim. */
export const RedirectLogo = styled(ProcessingLogo)`
  width: 72px;
  height: 72px;
`

export const ProcessingBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`

export const ProcessingTitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 20px;
  line-height: 1.6;
  color: ${theme.colors.text2};

  strong {
    font-weight: 700;
  }
`

export const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const indeterminate = keyframes`
  0% {
    left: -40%;
  }
  100% {
    left: 100%;
  }
`

export const ProgressTrack = styled.span`
  position: relative;
  width: 456px;
  max-width: 60vw;
  height: 12px;
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.chip};
  overflow: hidden;
`

export const ProgressFill = styled.span`
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  border-radius: ${theme.radius.pill};
  background: ${theme.gradients.amethyst};
  animation: ${indeterminate} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    left: 0;
    width: 30%;
    animation: none;
  }
`

export const ProgressCount = styled.span`
  font-family: ${theme.font.sans};
  font-size: 16px;
  line-height: 22px;
  color: ${theme.colors.text2};
`

export const Success = styled.div`
  /* Its own stacking context, so the confetti layer (z-index: -1) lands BEHIND this content instead of
     escaping past it and hiding behind the page background. z-index is inert without a position, so both
     are required — same arrangement Success.styles' Root uses for the item-purchase burst. */
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 895px;
  margin: 0 auto;
`

export const Banner = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: 16px;
  background: #e0f7e7;
  border: 1px solid #34ce77;

  @media (max-width: 560px) {
    flex-direction: column;
    text-align: center;
  }
`

export const BannerIcon = styled.img`
  flex: none;
  width: 60px;
  height: 60px;
`

export const BannerText = styled.p`
  flex: 1;
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 20px;
  line-height: 1.334;
  color: ${theme.colors.text2};
  text-align: center;

  strong {
    font-weight: 700;
  }
`

export const CreditsPanel = styled.div`
  padding: 24px;
  border-radius: 16px;
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.gray4};
`

export const CreditsRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 109px;
  /* SYMMETRIC on purpose. The coin is absolutely positioned, so the only job of the left padding is to keep
     the text clear of it — but with padding on one side only, centring puts the text in the middle of the
     space LEFT OF the coin rather than in the middle of the banner, which reads as text nudged right.
     Mirroring the padding puts it on the banner's true centre line. Below 900px the banner is too narrow to
     give up 300px, so it falls back to clearance-only until the layout stacks at 560px. */
  padding: 8px 150px;
  border-radius: ${theme.radius.btn};
  background: #f4e9ff;

  @media (max-width: 900px) {
    padding: 8px 24px 8px 150px;
  }

  @media (max-width: 560px) {
    flex-direction: column;
    gap: 10px;
    padding: 120px 16px 16px;
  }
`

export const CreditsCoin = styled.img`
  position: absolute;
  left: 35px;
  top: 50%;
  transform: translateY(-50%);
  width: 93px;
  height: 93px;
  filter: drop-shadow(5px 7px 14px rgba(0, 0, 0, 0.17));

  @media (max-width: 560px) {
    left: 50%;
    top: 16px;
    transform: translateX(-50%);
  }
`

export const CreditsText = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: ${theme.font.sans};
  color: ${theme.colors.text};

  .ico {
    width: 30px;
    height: 30px;
    color: ${theme.colors.text};
  }
`

export const CreditsAmount = styled.strong`
  font-size: 24px;
  font-weight: 700;
  text-transform: capitalize;
`

export const CreditsAdded = styled.span`
  font-size: 14px;
  font-weight: 400;
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  @media (max-width: 560px) {
    flex-direction: column;
  }
`

export const ActionButton = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 12px;
  border: 0;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.accent};
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  color: ${theme.colors.softWhite};
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.15s ease,
    filter 0.15s ease;

  &:hover {
    filter: brightness(1.08);
  }
  &[data-variant='outline'] {
    background: ${theme.colors.white};
    border: 2px solid ${theme.colors.accent};
    color: ${theme.colors.accent};
  }
  &[data-variant='outline']:hover {
    background: rgba(105, 31, 169, 0.06);
    filter: none;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const StatusPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px;
  text-align: center;
`

export const StatusTitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 700;
  color: ${theme.colors.text};

  &[data-tone='error'] {
    color: ${theme.colors.err};
  }
`

export const StatusActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`

export const ErrorText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  color: ${theme.colors.err};
`
