import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

// The landing's own purples, copied from decentraland/sites rather than approximated: `deep` is the hero's
// base colour (Hero.styled.ts) and the other three are the stops of the gradient that site shows while the
// hero loads (pages/index.styled.ts). Someone who arrives here from decentraland.org should not notice they
// changed sites, and matching by eye is how two brand surfaces drift apart.
const deep = '#39055c'
const mid = '#570f88'
const bright = '#6814a0'
const night = '#1a0230'

// Emotion's helper rather than a raw @keyframes inside a styled template: the helper guarantees the animation
// name it emits is the one the rule references.
const breathe = keyframes`
  0%, 100% { opacity: 0.6; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1); }
`

// The centring translate is repeated in every frame because an `animation` overrides the static `transform`
// outright — leaving it out here would snap the layer to the bottom-right the moment the animation starts.
const revolve = keyframes`
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
`

// Translate only, no scale: scaling this layer would breathe the whole background's brightness in and out
// behind the copy, which is the difference between ambient and distracting.
const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0); }
  33% { transform: translate3d(3%, -2.5%, 0); }
  66% { transform: translate3d(-2.5%, 3%, 0); }
`

// Owns the whole viewport rather than sitting inside the page shell: the shell renders a NavBar and a footer
// full of links into a Shop that is closed, so this replaces it instead of living in it.
// Fixed to the viewport rather than min-height'd: as a min-height block it stacked with the document's own
// box and the page scrolled a few pixels, which on a single-screen holding page reads as a rendering bug.
// `inset: 0` makes it exactly the viewport, and `overflow: hidden` means there is nothing to scroll at all.
// 100dvh over 100vh so mobile browser chrome doesn't push it taller than the visible area.
export const Wrapper = styled.div`
  position: fixed;
  inset: 0;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 24px;
  text-align: center;

  /* The landing's deep purple, animated in two layers: a field of purple blooms turning slowly, and warmer
     ones drifting over it. It replaces a near-white screen that read as an empty page rather than a held one.
     Both layers are gradients on transforms — no video, no image request. The equivalent on the landing is an
     11 MB mp4, which is a lot of bytes to spend telling someone they cannot come in yet.
     A single committed look, deliberately: this is one dark screen, not a themed surface, so there is no
     light variant to keep in step. Every purple here clears 12:1 against white text. */
  background: ${deep};

  &::before,
  &::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }

  /* Sized to twice the largest viewport side and pinned by its own centre, so no corner of the square can
     ever swing into view as it turns. The overflow:hidden above is what keeps it from adding scroll.
     Offset blooms rather than a conic gradient, which was the obvious way to build a revolving wheel and the
     wrong one: a conic's wedges all converge on its centre, that centre is the middle of the viewport, and the
     middle of the viewport is exactly where the mark and the headline sit — so it drew a set of faint spokes
     meeting behind the copy. Blooms have no such point. */
  &::before {
    top: 50%;
    left: 50%;
    width: 200vmax;
    height: 200vmax;
    transform: translate(-50%, -50%);
    background:
      radial-gradient(38vmax 34vmax at 43% 41%, ${bright} 0%, rgba(104, 20, 160, 0) 68%),
      radial-gradient(42vmax 38vmax at 59% 55%, ${mid} 0%, rgba(87, 15, 136, 0) 70%),
      radial-gradient(34vmax 30vmax at 51% 65%, ${night} 0%, rgba(26, 2, 48, 0) 72%), ${deep};
    animation: ${revolve} 60s linear infinite;
  }

  /* Keeps the coral and amber the white version had, at a strength that reads as warmth in the purple rather
     than as two orange patches, plus one brighter purple bloom for depth. Last layer is a corner vignette so
     the edges settle instead of banding. */
  &::after {
    inset: 0;
    background:
      radial-gradient(58% 50% at 22% 26%, rgba(104, 20, 160, 0.55) 0%, rgba(104, 20, 160, 0) 70%),
      radial-gradient(52% 46% at 80% 28%, rgba(255, 45, 85, 0.14) 0%, rgba(255, 45, 85, 0) 70%),
      radial-gradient(55% 48% at 64% 82%, rgba(255, 201, 91, 0.1) 0%, rgba(255, 201, 91, 0) 70%),
      radial-gradient(78% 68% at 50% 50%, rgba(26, 2, 48, 0) 55%, rgba(26, 2, 48, 0.5) 100%);
    animation: ${drift} 28s ease-in-out infinite;
  }

  /* A pseudo-element paints above its own element's background, so both layers land on top of the copy unless
     the copy is given a stacking context of its own. */
  & > * {
    position: relative;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before,
    &::after {
      animation: none;
    }
  }
`

export const LogoRing = styled.div`
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  /* The DCL mark's outer ring is #FCFCFC. On the purple it stands on its own, so this disc is no longer
     rescuing it from a white background — it is a soft halo that keeps the mark from floating unanchored, and
     it has to be light rather than the dark tint the white version used, which would read as a hole. */
  background: rgba(255, 255, 255, 0.08);
  animation: ${breathe} 3s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// An <img> rather than a CSS background: if the asset ever fails to resolve, a broken image is visible and
// gets fixed, while a background silently renders nothing — which is exactly how this went unnoticed.
export const Logo = styled.img`
  width: 64px;
  height: 64px;
  display: block;
`

// The three below set an explicit light colour instead of inheriting the document's near-black body text,
// which on the purple would be all but invisible. Stated as colours rather than as `opacity` on white: an
// opacity fades any future child along with the text, and these are text colours, not a dimmed element.
export const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
`

export const Body = styled.p`
  margin: 0;
  max-width: 42ch;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.82);
`

export const Hint = styled.p`
  margin: 0;
  max-width: 42ch;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
`
