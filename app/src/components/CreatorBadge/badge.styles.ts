import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

// Shared pill shell for the creator + collection badges (avatar slot + name, optionally a link button).
// Consumers reach in for context tweaks via `styled(CreatorBadge)` referencing these exported parts.

export const Name = styled.span`
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// Wraps the name text so consumers can restyle just the name (not the "By " prefix).
export const Display = styled.span``

const avaBase = css`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
  background: ${theme.colors.media};
`

// Lettered fallback avatar (span with the creator's initial as text).
export const Ava = styled.span`
  ${avaBase};

  &[data-letter] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: ${theme.colors.white};
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
  }
`

// Image avatar (accepts src/alt, unlike the span-based Ava with `as="img"`).
export const AvaImg = styled.img`
  ${avaBase};
`

export const Root = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${theme.colors.muted};
  font-size: 12px;
  min-width: 0;

  &[data-link] {
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    font: inherit;
    cursor: pointer;
    max-width: 100%;
  }
  &[data-link]:hover [data-testid='creator-name'] {
    color: ${theme.colors.text};
    text-decoration: underline;
  }
`
