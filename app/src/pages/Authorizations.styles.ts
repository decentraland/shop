import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const spin = keyframes`
  to { transform: rotate(360deg); }
`

export const Section = styled.section`
  width: 100%;
  min-width: 0;
  max-width: 760px;
`

export const Head = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
`

export const Title = styled.h1`
  font-family: ${theme.font.sans};
  margin: 0;
`

export const Intro = styled.p`
  color: ${theme.colors.muted};
  font-size: 14px;
  margin: 0;
  max-width: 60ch;
`

export const Group = styled.div`
  margin-bottom: 28px;
`

export const GroupTitle = styled.h2`
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  color: ${theme.colors.text};
  margin: 0 0 10px;
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const Row = styled.div`
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.line};
  border-radius: 16px;

  ${theme.media.down('mobile')} {
    grid-template-columns: 44px 1fr;
    grid-row-gap: 10px;
  }
`

export const Thumb = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: ${theme.colors.media};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.muted2};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const RowInfo = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

export const RowName = styled.span`
  font-weight: 700;
  color: ${theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const RowDesc = styled.span`
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const RowStatus = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: ${theme.colors.muted2};

  &[data-active='true'] {
    color: ${theme.colors.okStrong};
  }
`

export const Control = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: end;

  ${theme.media.down('mobile')} {
    grid-column: 1 / -1;
    justify-self: start;
  }
`

// A toggle switch. `data-active` drives the fill; `data-busy` shows the working state. Selected via a
// stable data-testid in tests; state asserted via data-* attributes (never style classes).
export const Toggle = styled.button`
  position: relative;
  width: 46px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: ${theme.radius.pill};
  border: none;
  background: ${theme.colors.gray4};
  cursor: pointer;
  transition: background 0.15s;
  padding: 0;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${theme.colors.white};
    transition: transform 0.15s;
  }

  &[data-active='true'] {
    background: ${theme.colors.accent};
  }
  &[data-active='true']::after {
    transform: translateX(20px);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Spinner = styled.span`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid ${theme.colors.gray4};
  border-top-color: ${theme.colors.accent};
  animation: ${spin} 0.7s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const EmptyHint = styled.p`
  color: ${theme.colors.muted};
  font-size: 14px;
  margin: 0;
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 90px 20px;
  min-height: 50vh;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 6px 0 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`
