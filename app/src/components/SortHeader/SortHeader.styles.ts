import styled from '@emotion/styled'

export const Root = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0;
  white-space: normal;
  text-align: inherit;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;

  &[data-align='right'] {
    flex-direction: row-reverse;
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
    border-radius: 4px;
  }

  [data-testid='sort-header-chevron'] {
    flex: none;
    opacity: 0.35;
    transition: opacity 0.15s;
  }

  &[data-dir] [data-testid='sort-header-chevron'],
  &:hover [data-testid='sort-header-chevron'] {
    opacity: 1;
  }
`
