import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { media } = theme

export const Footer = styled.footer`
  width: 100%;
`

export const Main = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  padding: 32px 80px;
  background: radial-gradient(
    ellipse at 0% 0%,
    rgba(121, 47, 158, 0.6) 0%,
    rgba(74, 23, 102, 0.8) 25%,
    rgba(51, 12, 74, 0.9) 50%,
    rgba(27, 0, 46, 1) 75%
  );

  ${media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: center;
    gap: 32px;
    padding: 48px 16px;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(109, 34, 151, 1) 0%,
      rgba(89, 26, 125, 1) 12%,
      rgba(69, 18, 99, 1) 25%,
      rgba(48, 9, 72, 1) 50%,
      rgba(28, 1, 46, 1) 75%
    );
  }
`

export const Left = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding: 40px 0;
  max-width: 450px;

  ${media.maxWidth('mobile')} {
    padding: 0;
    width: 100%;
    align-items: center;
    max-width: 100%;
  }
`

export const Wordmark = styled.span`
  font-weight: 700;
  font-size: 40px;
  line-height: 1;
  color: #fcfcfc;
  letter-spacing: -0.02em;
`

export const News = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;

  ${media.maxWidth('mobile')} {
    width: 100%;
    align-items: center;
  }
`

export const NewsTitle = styled.p`
  margin: 0;
  font-weight: 500;
  font-size: 20px;
  line-height: 1.6;
  color: #fcfcfc;

  ${media.maxWidth('mobile')} {
    text-align: center;
  }
`

export const NewsFrame = styled.iframe`
  width: 100%;
  max-width: 450px;
  border: none;
  border-radius: 6px;
`

// data-variant='desktop' | 'mobile' — only one shows per breakpoint.
export const Connect = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;

  &[data-variant='mobile'] {
    display: none;
  }
  ${media.maxWidth('mobile')} {
    &[data-variant='desktop'] {
      display: none;
    }
    &[data-variant='mobile'] {
      display: flex;
      width: 100%;
      padding-top: 12px;
    }
  }
`

export const Label = styled.p`
  margin: 0;
  font-weight: 400;
  font-size: 16px;
  line-height: 1.5;
  color: #cfcdd4;
  text-transform: uppercase;
`

export const Social = styled.div`
  display: flex;
  align-items: center;
  gap: 28px;
  color: #fff;

  & a {
    color: inherit;
    display: flex;
    transition: opacity 0.2s ease;
  }
  & a:hover {
    opacity: 0.7;
  }
`

export const Right = styled.div`
  display: flex;
  gap: 80px;
  padding: 40px 0;

  ${media.maxWidth('mobile')} {
    display: none;
  }
`

export const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

export const FootLink = styled.a`
  font-weight: 600;
  font-size: 16px;
  line-height: 1.5;
  color: #fff;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`

export const MobileMenu = styled.div`
  display: none;
  flex-direction: column;
  width: 100%;

  ${media.maxWidth('mobile')} {
    display: flex;
  }
`

export const MenuLabel = styled.p`
  margin: 0;
  padding: 12px 0;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
  font-weight: 400;
  font-size: 14px;
  line-height: 1.75;
  color: #cfcdd4;
  text-transform: uppercase;
`

export const Dropdown = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 24px 0;
  border: none;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
  background: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 16px;
  line-height: 1.75;
  color: #fff;
  text-align: left;
`

export const Chev = styled.span`
  display: inline-flex;
  color: #fff;
  transition: transform 0.3s ease;

  &[data-open] {
    transform: rotate(180deg);
  }
`

export const DropContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  padding: 0;
  transition:
    max-height 0.3s ease,
    opacity 0.3s ease,
    padding 0.3s ease;

  &[data-open] {
    max-height: 400px;
    opacity: 1;
    padding: 16px 0 8px;
  }
`

export const MLink = styled.a`
  font-weight: 400;
  font-size: 15px;
  line-height: 1.5;
  color: #fcfcfc;
  text-decoration: none;
  padding-left: 8px;

  &:hover {
    text-decoration: underline;
  }
`

export const Bottom = styled.div`
  width: 100%;
  background: #161518;
  box-shadow: inset 0 1px 0 0 #43404a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;

  ${media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`

export const BottomLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  ${media.maxWidth('mobile')} {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    width: 100%;
  }
`

export const Lang = styled.div`
  position: relative;
`

export const LangBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  color: #fff;
`

export const LangMenu = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  background: #242129;
  border-radius: 8px;
  border: 1px solid #43404a;
  padding: 4px 0;
  min-width: 140px;
  z-index: 10;

  & button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #cfcdd4;
    white-space: nowrap;
  }
  & button:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  & button[data-active] {
    color: #fff;
    font-weight: 600;
  }
`

export const Legal = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  ${media.maxWidth('mobile')} {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
    width: 100%;
  }
`

export const LegalLink = styled.a`
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  color: #a09ba8;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: #cfcdd4;
  }
`

export const Copy = styled.span`
  font-weight: 400;
  font-size: 15px;
  line-height: 24px;
  color: #a09ba8;
  white-space: nowrap;

  ${media.maxWidth('mobile')} {
    display: none;
  }
`
