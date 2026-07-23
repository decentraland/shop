import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { radius, media } = theme

// White outlined pill shared by the "View profile" link and the (context-overridden) FollowButton.
const pill = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 28px;
  border: 2px solid #fff;
  border-radius: ${radius.btn};
  background: transparent;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  text-decoration: none;
`

// Cover banner with a centered avatar/name/description/actions block. The FollowButton (rendered with
// className "creator-hero__follow") is restyled to the white pill via `&&` so it beats Button's variant.
export const Root = styled.section`
  position: relative;
  border-radius: ${radius.card};
  overflow: hidden;
  margin-bottom: 24px;
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;

  && .creator-hero__follow {
    ${pill};
  }
  && .creator-hero__follow:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }

  ${media.maxWidth('mobile')} {
    min-height: 260px;
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

export const Links = styled.div`
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;

  ${media.maxWidth('mobile')} {
    top: 12px;
    right: 12px;
    gap: 6px;
  }
`

// Social link: the glyph is already a filled circle, so no button chrome — just the icon.
const linkCss = css`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: opacity 0.15s linear;

  &:hover {
    opacity: 0.8;
  }
  & .ico {
    width: 36px;
    height: 36px;
  }
  ${media.maxWidth('mobile')} {
    & .ico {
      width: 30px;
      height: 30px;
    }
  }
`

export const SocialLink = styled.a`
  ${linkCss};
`

// Edit-store pen: the round outlined-white button, smaller icon than the social links.
export const Edit = styled(Link)`
  ${linkCss};
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #fff;
  transition: background-color 0.15s linear;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.24);
  }
  & .ico {
    width: 16px;
    height: 16px;
  }
  ${media.maxWidth('mobile')} {
    width: 28px;
    height: 28px;
    & .ico {
      width: 14px;
      height: 14px;
    }
  }
`

export const Body = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 24px;
  padding: 32px 20px;

  ${media.maxWidth('mobile')} {
    padding: 56px 16px 24px;
  }
`

// Rendered as <img> (face) or <Ava as="span"> (placeholder); the per-user backdrop is inline.
export const Ava = styled.img`
  display: block;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  background: #ff4bed;

  ${media.maxWidth('mobile')} {
    width: 88px;
    height: 88px;
  }
`

export const Name = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.6;

  ${media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const Desc = styled.p`
  margin: 0;
  font-size: 15px;
  color: #fff;
  line-height: 1.6;
  max-width: 520px;

  ${media.maxWidth('mobile')} {
    font-size: 14px;
  }
`

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
`

export const View = styled.a`
  ${pill};
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
`
