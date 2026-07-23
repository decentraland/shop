import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors, radius, media } = theme

export const Root = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 24px;
  min-height: 72vh;

  ${media.maxWidth('md')} {
    grid-template-columns: 1fr;
    gap: 24px;
    text-align: center;
  }
`

export const Preview = styled.div`
  height: min(560px, 68vh);
  background: ${colors.media};
  border-radius: ${radius.card};
  overflow: hidden;
  position: relative;

  & iframe,
  & > * {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
`

// Composes the global `.spinner` (rendered className="spinner") — overrides just its box + margin.
export const Spinner = styled.span`
  margin: 4px auto 8px;
  width: 40px;
  height: 40px;
`

// Layout grouping for the text column (no visual style of its own).
export const Panel = styled.div``

export const Title = styled.h1`
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 20px 0 8px;
`

export const Sub = styled.p`
  font-size: 18px;
  color: #4b4b57;
  margin: 0 0 22px;
`

export const List = styled.ul`
  margin: 0 0 22px;
  padding-left: 18px;
  color: #4b4b57;
  line-height: 1.7;
`

export const Links = styled.div`
  display: flex;
  gap: 18px;
  justify-content: center;
  margin: 0 0 20px;
`

// The explorer link (<a>) and the "view order" button share this look.
const receiptCss = css`
  display: inline-block;
  margin: 0;
  color: ${colors.accent};
  font-weight: 600;
  font-size: 14px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
`
export const Receipt = styled.a`
  ${receiptCss};
`
export const ReceiptButton = styled.button`
  ${receiptCss};
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;

  ${media.maxWidth('md')} {
    justify-content: center;
  }
`

export const SuccessBtn = styled(Button)`
  min-width: 160px;
  text-align: center;
`
