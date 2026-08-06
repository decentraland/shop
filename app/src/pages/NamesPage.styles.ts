import styled from '@emotion/styled'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// NAMEs purchase page (Figma desktop 1368-353632, mobile 1368-356251). A translucent claim panel over
// the page field, followed by the "Why buy a NAME?" cards. Rendered inside the Assets main column when
// the NAMEs category is selected.

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
  color: ${theme.colors.gray4};
`

export const CrumbLink = styled.button`
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: ${theme.colors.gray4};

  &:hover {
    color: ${theme.colors.white};
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 2px;
  }
`

export const CrumbCurrent = styled.span`
  font-weight: 700;
  color: ${theme.colors.softWhite};
`

// Holds the hero and the info section. No fill of its own: the design puts both straight on the page
// field, so the lilac card this used to paint has gone with the light theme.
export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding-bottom: 48px;

  ${theme.media.maxWidth('mobile')} {
    gap: 32px;
    padding-bottom: 32px;
  }
`

// Figma 1368:353666: a translucent black panel edged in Flare's last stop, not a purple glow.
export const Hero = styled.div`
  position: relative;
  border: 1px solid ${theme.colors.magenta};
  border-radius: 24px;
  overflow: hidden;
  padding: 88px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  text-align: center;
  background: ${theme.colors.overlay};

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
  /* Figma 1368:349148 gives the field a 3px Orange edge — it is the page's one input, and the design
     leans on that weight to carry it. Red only when what has been typed cannot be claimed. */
  border: 3px solid ${({ invalid }) => (invalid ? theme.colors.dclRed : theme.colors.orange)};
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

  /* An empty field paints the PLACEHOLDER, which is lighter than a typed value — so the mirror has to
     be lighter too. Measuring the placeholder at the value's weight made the box a few pixels wider
     than the text in it, and ".dcl.eth" sat that far off the end of the word. */
  &[data-placeholder] {
    font-weight: 400;
  }

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
  /* Flush against the name: "yourname.dcl.eth" has to read as one address, and at 20px even a couple of
     pixels here look like a space someone typed by mistake. */
  margin-left: 0;
  /* Not selectable: it is the fixed part of the address, not something the reader typed. */
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
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.muted2};
  white-space: nowrap;
`

// The design system's primary button (Figma 738:53260 rest / 53252 hover / 53257 disabled): the "BUY
// Button" gradient, flat primary red under the pointer, and the SAME gradient at half opacity when
// there is nothing to claim. It used to carry Cerise with a brightness filter and a pale pink disabled
// state, none of which is in the system. Inline on the right on desktop; full-width below on mobile.
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
  background: ${theme.gradients.buyBtn};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.46px;
  line-height: 24px;
  text-transform: uppercase;
  transition: background-image 0.15s ease;

  /* Both ends stay on background-IMAGE: a gradient cannot interpolate to a plain colour, so swapping
     the background shorthand instead blanks the button for the length of the transition. */
  &:hover:not(:disabled),
  &:active:not(:disabled) {
    background-image: linear-gradient(${theme.colors.dclRed}, ${theme.colors.dclRed});
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
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

// The price rides a size larger than the label beside it (Figma 2302:307649), with the currency mark
// at the 13.26x14 the design draws rather than a round 16.
export const Price = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 18px;
  font-weight: 600;

  .ico {
    width: 13.26px;
    height: 14px;
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
 * The status text floated under the input rather than sitting in the flow, where it resized the hero
 * on almost every keystroke. Renders inside InputWrap, which owns the positioning context.
 */
export const StatusFloating = styled(Status)`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2;

  /* Static on mobile, as TakenBanner is: the claim button sits below InputWrap there, so anything
     floating out of the input lands on top of it. */
  ${theme.media.maxWidth('mobile')} {
    position: static;
    margin-top: 8px;
  }
`

// Sits inside a muted StatusFloating, so it inherits that tone rather than the red TakenOfferLink uses:
// registration being closed is not the user's mistake, and this link is the way forward, not a warning.
export const NoticeLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-transform: uppercase;
  white-space: nowrap;

  ${theme.media.maxWidth('mobile')} {
    margin-left: 0;
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
  color: ${theme.colors.white};

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
  color: ${theme.colors.gray4};

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

// Figma 2302:307817: a translucent black panel holding an icon over the copy. It replaced a white card
// with a photographic banner across the top — the illustrations were the light theme's.
export const Card = styled.article`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 24px;
  background: ${theme.colors.overlay};
  border-radius: 24px;

  @media (forced-colors: active) {
    outline: 1px solid CanvasText;
  }

  ${theme.media.maxWidth('mobile')} {
    gap: 20px;
    padding: 20px;
  }
`

// The icons are drawn at their own sizes (58x55 through 56x64), so height is what holds them level.
// `align-self` is load-bearing: the card is a column flex box, so a stretched item takes the card's
// width and `width: auto` resolves against THAT rather than against the icon's own ratio — measured
// 239px wide for a 58px icon.
export const CardIcon = styled.img`
  display: block;
  align-self: flex-start;
  height: 55px;
  width: auto;
`

export const CardInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const CardTitle = styled.h3`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 20px;
  line-height: 1.57;
  text-transform: uppercase;
  color: ${theme.colors.white};
`

export const CardText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.57;
  color: ${theme.colors.media};
`

// The one highlighted run in the copy — the example address, which the design sets bold white rather
// than tinting it.
export const CardHighlight = styled.span`
  font-weight: 700;
  color: ${theme.colors.white};
`

// Not in the design's card, but ours points at the Worlds docs and the link has to survive the dark
// panel — the accent purple it used to carry is unreadable on it.
export const CardLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  font-family: ${theme.font.sans};
  font-weight: 500;
  font-size: 14px;
  line-height: 30px;
  color: ${theme.colors.softWhite};
  text-decoration: underline;

  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
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
