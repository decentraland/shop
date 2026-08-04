import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import backdrop from '~/assets/credits/packs-backdrop.webp'

// Get credits page (Figma 1654-374586). The pack picker lives inside ONE full-bleed purple card
// (Figma 1654-374620) that holds the heading and the pack row; the post-checkout states below stay on
// the light page, where their own Figma frames (1208-242158 / 1208-243058) put them.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const Hero = styled.section`
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: ${theme.radius.banner};
  overflow: hidden;
  padding: 82px clamp(16px, 7.06%, 122px) 129px;

  ${theme.media.maxWidth('lg')} {
    padding: 48px 24px 56px;
  }
  ${theme.media.maxWidth('mobile')} {
    padding: 32px 16px 40px;
  }
`

export const HeroBackdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.9;
  pointer-events: none;
  background-image: url(${backdrop});
  background-size: cover;
  background-position: 50% 96%;
  background-repeat: no-repeat;
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
  gap: 12px;
  width: 100%;
  text-align: center;
`

export const Title = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 40px;
  font-weight: 700;
  line-height: 1.167;
  color: ${theme.colors.white};
  text-transform: capitalize;

  ${theme.media.maxWidth('mobile')} {
    font-size: 28px;
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

export const Learn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 500;
  line-height: 30px;
  color: ${theme.colors.white};
  text-decoration: underline;
  text-underline-offset: 2px;

  .ico {
    width: 26px;
    height: 26px;
  }
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
  /* Figma 1654:372757 — a plain 1px amber stroke, NOT the Flare gradient this used to paint through a
     masked pseudo-element. The gradient version also cost the two ::before/::after ring layers below. */
  border: 1px solid ${theme.colors.flareAmber};
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

  /* Hover / focus / active (Figma 1654:372756): purple fill, a 5px DCL-red stroke and the violet glow.
     The stroke replaces a 6px gradient ring that floated outside the card — the design puts it on the card
     edge, which is also why the border thickens in place rather than growing the element: box-sizing is
     border-box, so the outer 351.5px is unchanged and the 4px comes off the content box, exactly as the two
     Figma variants measure. */
  &:hover,
  &:focus-visible,
  &:active {
    background: ${theme.colors.accent};
    border-width: 5px;
    border-color: ${theme.colors.dclRed};
    box-shadow: 0 0 8px ${theme.colors.brandViolet};
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
    border-width: 1px;
    border-color: ${theme.colors.flareAmber};
    box-shadow: none;
  }

  /* Figma 1654:372759 — the mobile card is its own set of metrics, not a scaled-down desktop one. */
  ${theme.media.maxWidth('mobile')} {
    gap: 12px;
    padding: 8px;
    border-radius: 16px;
    border-color: ${theme.colors.magenta};

    &:hover,
    &:focus-visible,
    &:active {
      border-color: ${theme.colors.dclRed};
    }
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

export const PackTop = styled.span`
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

export const PackArt = styled.span`
  display: block;
  width: 253.5px;
  max-width: 100%;
  aspect-ratio: 1;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /**
   * FLUID, capped — not a fixed 200px.
   *
   * The fixed width overflowed its card: measured at a 375px viewport the artwork rendered 200px inside a
   * 150px parent, spilling 25px out of each side of the card (the max-width above did not hold it,
   * which is why this restates the intent as a width rather than relying on a cap). Two per row means the
   * cell is whatever half the viewport minus gaps happens to be, so the art has to follow it.
   */
  @media (max-width: 520px) {
    /**
     * STRETCHED to the card's content box, not sized by its own content.
     *
     * The card is a column flex with align-items: center, so its children are shrink-to-fit — which let each
     * pack's artwork take a different width (measured 118px and 152px in two identical 150px cards) and let
     * the wider one spill 2px out of each side. Stretching makes every card's art box exactly the content
     * width, so all four are identical and none can exceed it.
     */
    align-self: stretch;
    width: auto;
    max-width: none;

    /* The wrapper alone is not enough: whatever sits inside it (picture/img) must be capped too, or it
       reintroduces the same overflow one level down. */
    > * {
      max-width: 100%;
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
  height: 48px;
  padding: 0 12px;
  border-radius: ${theme.radius.card};
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 16px;
  font-weight: 800;
  line-height: 24px;
  letter-spacing: 0.46px;
  color: ${theme.colors.text2};
  text-transform: uppercase;
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

export const SkAmount = styled(Shimmer)`
  width: 60%;
  height: 30px;
  border-radius: ${theme.radius.chip};
`

export const SkArt = styled(Shimmer)`
  width: 253.5px;
  max-width: 100%;
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
