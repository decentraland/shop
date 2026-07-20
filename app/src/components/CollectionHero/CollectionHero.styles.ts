import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Collection page banner — the creator's store cover with the collection name centered over it.
// Shorter than the creator-hero (no avatar/actions block); mirrors its cover + scrim treatment so the
// two storefront banners read as a family.
export const Root = styled.section`
  position: relative;
  border-radius: ${theme.radius.card};
  overflow: hidden;
  margin-bottom: 24px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;

  ${theme.media.down('mobile')} {
    min-height: 140px;
  }
`

export const Cover = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
`

export const CoverImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`

export const Scrim = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.55) 100%);
`

export const Title = styled.h1`
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 32px 24px;
  text-align: center;
  color: ${theme.colors.white};
  font-size: 40px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);

  ${theme.media.down('mobile')} {
    padding: 24px 16px;
    font-size: 26px;
  }
`
