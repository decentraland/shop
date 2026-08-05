import styled from '@emotion/styled'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// NAMEs purchase page (Figma desktop 1368-353269, mobile 1368-356251). A full-width purple banner
// (hero + search) sitting on a light-lilac card, followed by the "Why buy a NAME?" info cards.
// Rendered inside the Assets main column when the NAMEs category is selected.

export const Root = styled.div`
  width: 100%;
  min-width: 0;
`

// "Collectibles  >  NAMEs" (Figma node 1368-353300). 12px gray; the crumb is a real button back to
// the collectibles grid.
export const Breadcrumb = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 16px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1;
  color: ${theme.colors.muted};
`

export const CrumbLink = styled.button`
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: ${theme.colors.muted};

  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const CrumbCurrent = styled.span`
  font-weight: 700;
  color: ${theme.colors.muted};
`

// The lilac card wrapping the hero + info cards.
export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding-bottom: 48px;
  background: #ecdbfd;
  border-radius: ${theme.radius.banner};
  overflow: hidden;

  ${theme.media.maxWidth('mobile')} {
    gap: 32px;
    padding-bottom: 32px;
  }
`

// Purple hero. Figma uses a decorated image fill; we approximate with the brand purple glow so no
// multi-MB marketing render ships in the bundle.
export const Hero = styled.div`
  position: relative;
  border-radius: ${theme.radius.banner};
  overflow: hidden;
  padding: 88px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  text-align: center;
  background: radial-gradient(120% 95% at 50% 118%, #d13bd6 0%, #a026b0 28%, #6a1b9c 58%, #4a1173 100%);

  ${theme.media.maxWidth('mobile')} {
    padding: 40px 20px;
    gap: 28px;
  }
`

export const HeroCopy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`

export const HeroTitle = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 40px;
  line-height: 1.167;
  color: ${theme.colors.white};

  ${theme.media.maxWidth('mobile')} {
    font-size: 26px;
  }
`

export const HeroSubtitle = styled.p`
  margin: 0;
  max-width: 760px;
  font-family: ${theme.font.sans};
  font-weight: 500;
  font-size: 24px;
  line-height: 1.334;
  color: #ecebed;

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

// The search block: input row (desktop = inline button) + status message. On mobile the claim
// button drops below the input (Figma 1368-356251).
export const SearchBlock = styled.div`
  width: min(785px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// Positioning context so the "taken" banner can drop below the input without growing the hero.
export const InputWrap = styled.div`
  position: relative;
`

export const InputRow = styled('div', noForward('invalid'))<{ invalid?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 16px;
  background: ${theme.colors.softWhite};
  border: 1.5px solid ${({ invalid }) => (invalid ? theme.colors.dclRed : theme.colors.line)};
  border-radius: 20px;

  &:focus-within {
    border-color: ${({ invalid }) => (invalid ? theme.colors.dclRed : theme.colors.magenta)};
  }

  ${theme.media.maxWidth('mobile')} {
    border-radius: 16px;
  }
`

// Hidden mirror of the NAME input's text — its measured width sizes the input so the value sits flush
// against ".dcl.eth". MUST keep the exact same font metrics as NameInput.
export const Sizer = styled.span`
  position: absolute;
  left: -9999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: pre;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.6;

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

// "This NAME is taken" banner (Figma 1368-354064): red-light bar under the input, with a MAKE OFFER
// link out to the legacy marketplace's secondary NAME market.
export const TakenBanner = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #ffcdd4;
  color: #ec303a;
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;

  ${theme.media.maxWidth('mobile')} {
    position: static;
    margin-top: 8px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
`

export const TakenOfferLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: #ec303a;
  font-weight: 600;
  text-decoration: underline;
  text-transform: uppercase;
  white-space: nowrap;

  ${theme.media.maxWidth('mobile')} {
    margin-left: 0;
  }
`

export const InputField = styled.label`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
  cursor: text;
  overflow: hidden;
`

export const At = styled.span`
  flex: none;
  margin-right: 8px;
  font-family: ${theme.font.sans};
  font-size: 26px;
  font-weight: 500;
  line-height: 1;
  color: ${theme.colors.muted2};

  ${theme.media.maxWidth('mobile')} {
    font-size: 20px;
  }
`

// The name <input> sizes to its content (ch width) so the ".dcl.eth" suffix glues right after the
// typed text, matching "yourname.dcl.eth" in the Figma.
export const NameInput = styled.input`
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.6;
  color: ${theme.colors.text};
  padding: 0;

  &::placeholder {
    color: ${theme.colors.muted1};
    font-weight: 400;
  }

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const Suffix = styled.span`
  flex: none;
  margin-left: 2px;
  /* Not selectable: it is the fixed part of the address, not something the reader typed. Dragging across
     the field used to highlight ".dcl.eth" along with the NAME, which invites copying it into the input. */
  user-select: none;
  -webkit-user-select: none;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 400;
  line-height: 1.6;
  color: ${theme.colors.muted1};

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const Counter = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted2};
  white-space: nowrap;
`

// Gradient claim button. Inline on the right on desktop; full-width below on mobile.
export const ClaimButton = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 52px;
  padding: 0 24px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  background: ${theme.gradients.cerise};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.46px;
  line-height: 24px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: not-allowed;
    background: #e7c8e9;
    color: #fbe9fb;
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

// Mobile-only full-width claim button under the input.
export const ClaimButtonMobile = styled(ClaimButton)`
  display: none;

  ${theme.media.maxWidth('mobile')} {
    display: inline-flex;
    width: 100%;
    height: 48px;
    border-radius: 12px;
  }
`

export const Price = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;

  .ico {
    width: 16px;
    height: 16px;
  }
`

// Status line under the input (checking / taken / invalid / available).
export const Status = styled.div<{ tone: 'error' | 'ok' | 'muted' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 500;
  text-align: left;

  background: ${({ tone }) =>
    tone === 'error'
      ? 'rgba(255, 45, 85, 0.12)'
      : tone === 'ok'
        ? 'rgba(30, 166, 114, 0.14)'
        : 'rgba(255,255,255,0.14)'};
  color: ${({ tone }) => (tone === 'error' ? theme.colors.dclRed : tone === 'ok' ? '#0f7a4f' : '#ecebed')};

  .ico {
    width: 16px;
    height: 16px;
    flex: none;
  }
`

/**
 * The same status text, floated under the input instead of sitting in the flow.
 *
 * In the flow it pushed the hero taller the moment a reader typed the third character — the whole panel
 * jumped as "Checking availability…" appeared and again as it went away, on every keystroke that changed
 * the answer. Absolute keeps the hero a fixed height and puts the message where the other things that drop
 * out of this input already appear (see TakenBanner, which never had the problem).
 *
 * Renders inside InputWrap, which owns the positioning context.
 */
export const StatusFloating = styled(Status)`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2;

  /* Back into the flow on mobile, exactly as TakenBanner does and for the same reason: the claim button
     moves out of the input and below InputWrap there, so anything floating out of the input lands on top
     of it. The hero growing is the lesser problem of the two, and only the desktop panel was the
     complaint. */
  ${theme.media.maxWidth('mobile')} {
    position: static;
    margin-top: 8px;
  }
`

// "Why buy a NAME?" section: a centered title + intro, then a row of four info cards (a 3D
// illustration over a rarity-gradient media panel, with a bold title + description below).
export const Why = styled.section`
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: 0 48px;

  ${theme.media.maxWidth('mobile')} {
    gap: 32px;
    padding: 0 20px;
  }
`

export const WhyHead = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`

export const WhyTitle = styled.h2`
  margin: 0;
  text-align: center;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 32px;
  line-height: 1.167;
  color: ${theme.colors.text2};

  ${theme.media.maxWidth('mobile')} {
    font-size: 22px;
  }
`

export const WhyIntro = styled.p`
  margin: 0;
  max-width: 907px;
  text-align: center;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 20px;
  line-height: 1.57;
  color: ${theme.colors.text};

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  align-items: stretch;

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: repeat(2, 1fr);
  }
  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
  }
`

/**
 * The outline is a box-shadow spread rather than a `border`, and that is what lets the artwork reach the
 * card's real edge. A border takes up space inside the element, so the image — which fills the content box
 * — stopped 0.25px short of the rounded corner and the border showed through as a hairline arc against the
 * illustration. Compensating with a negative margin worked on the straight edges and could not work on the
 * curves, because the clip radius shrinks with the border while the image stays square.
 *
 * A box-shadow occupies no layout, so the content box IS the border box: the image covers the corner
 * completely and `overflow: hidden` clips it to the same radius the outline draws.
 */
export const Card = styled.article`
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: ${theme.colors.white};
  box-shadow: 0 0 0 0.25px ${theme.colors.muted2};
  border-radius: ${theme.radius.card};
  overflow: hidden;
`

/**
 * The gradient background is baked into the illustration asset (a 388×235 render), so the image both fills
 * and colors the media panel — the container just keeps its aspect ratio as the card flexes.
 *
 * A plain `width: 100%` reaches the card's edge on every side now that the outline is a box-shadow rather
 * than a border (see Card): there is no border box to sit inside, so no bleed to compensate for, and the
 * card's `overflow: hidden` clips the top corners to its radius.
 */
export const CardMedia = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 388 / 235;
  object-fit: cover;
`

export const CardInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
`

export const CardTitle = styled.h3`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 20px;
  line-height: 1.57;
  text-transform: uppercase;
  color: ${theme.colors.text};
`

export const CardText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.57;
  color: ${theme.colors.text};
`

export const CardHighlight = styled.span`
  font-weight: 600;
  color: ${theme.colors.accent};
`

export const CardLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  font-family: ${theme.font.sans};
  font-weight: 500;
  font-size: 14px;
  line-height: 30px;
  color: ${theme.colors.accent};
  text-decoration: underline;

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }

  .ico {
    width: 13px;
    height: 13px;
  }
`

// Accessible-only live region for announcing availability to screen readers.
export const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`
