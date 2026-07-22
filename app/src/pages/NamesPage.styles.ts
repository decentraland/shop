import styled from '@emotion/styled'
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

  ${theme.media.down('mobile')} {
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

  ${theme.media.down('mobile')} {
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

  ${theme.media.down('mobile')} {
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

  ${theme.media.down('mobile')} {
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

export const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 16px;
  background: ${theme.colors.softWhite};
  border: 1.5px solid ${theme.colors.line};
  border-radius: 20px;

  &:focus-within {
    border-color: ${theme.colors.magenta};
  }

  ${theme.media.down('mobile')} {
    border-radius: 16px;
  }
`

export const InputField = styled.label`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: text;
  overflow: hidden;
`

export const At = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 26px;
  font-weight: 500;
  line-height: 1;
  color: #a09ba8;

  ${theme.media.down('mobile')} {
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
    color: #5e5b67;
    font-weight: 400;
  }

  ${theme.media.down('mobile')} {
    font-size: 16px;
  }
`

export const Suffix = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 400;
  line-height: 1.6;
  color: #5e5b67;

  ${theme.media.down('mobile')} {
    font-size: 16px;
  }
`

export const Counter = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: #a09ba8;
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

  ${theme.media.down('mobile')} {
    display: none;
  }
`

// Mobile-only full-width claim button under the input.
export const ClaimButtonMobile = styled(ClaimButton)`
  display: none;

  ${theme.media.down('mobile')} {
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
  color: ${({ tone }) => (tone === 'error' ? '#ff2d55' : tone === 'ok' ? '#0f7a4f' : '#ecebed')};

  .ico {
    width: 16px;
    height: 16px;
    flex: none;
  }
`

// "Why buy a NAME?" section.
export const Why = styled.section`
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: 0 48px;

  ${theme.media.down('mobile')} {
    gap: 24px;
    padding: 0 20px;
  }
`

export const WhyTitle = styled.h2`
  margin: 0;
  text-align: center;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 32px;
  line-height: 1.167;
  color: ${theme.colors.text2};

  ${theme.media.down('mobile')} {
    font-size: 22px;
  }
`

export const Cards = styled.div`
  display: flex;
  gap: 48px;
  align-items: stretch;

  ${theme.media.down('mobile')} {
    flex-direction: column;
    gap: 24px;
  }
`

export const Card = styled.article`
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 340px;
  background: ${theme.colors.white};
  border: 0.25px solid ${theme.colors.muted2};
  border-radius: ${theme.radius.card};
  overflow: hidden;
`

// Marketing scene image is replaced with a themed gradient (see Hero note).
export const CardMedia = styled.div`
  flex: 1 0 0;
  min-height: 0;
  background: linear-gradient(135deg, #7a1fa2 0%, #c640cd 55%, #ff2d55 100%);
`

export const CardInfo = styled.div`
  flex: none;
  height: 96px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
`

export const CardText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.57;
  color: ${theme.colors.text};
`

export const CardLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ${theme.font.sans};
  font-weight: 500;
  font-size: 14px;
  line-height: 30px;
  color: ${theme.colors.accent};
  text-decoration: underline;

  .ico {
    width: 13px;
    height: 13px;
  }
`

export const CardLinkText = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 500;
  font-size: 14px;
  line-height: 30px;
  color: ${theme.colors.accent};
  text-decoration: underline;
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
