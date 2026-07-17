import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

export type SpinnerSize = 'small' | 'medium' | 'large'
export type SpinnerDirection = 'row' | 'column'

type SpinnerProps = {
  /** Optional text shown next to (row) or below (column) the spinner. */
  label?: string
  /** Diameter preset. Defaults to medium. */
  size?: SpinnerSize
  /** Lay the spinner + label out horizontally (row) or vertically (column). Defaults to column. */
  direction?: SpinnerDirection
  className?: string
}

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`

// Layout is driven off the same data-* attributes the tests assert on (data-direction / data-size),
// so the markup carries one set of hooks for both styling and testing — no style-only props leak to
// the DOM.
const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: ${theme.colors.muted};

  &[data-direction='row'] {
    flex-direction: row;
  }
  &[data-direction='column'] {
    flex-direction: column;
    text-align: center;
  }
`

const Ring = styled.span`
  flex: none;
  border-radius: 50%;
  border-style: solid;
  border-color: ${theme.colors.line};
  border-top-color: ${theme.colors.accent};
  animation: ${spin} 0.8s linear infinite;

  &[data-size='small'] {
    width: 18px;
    height: 18px;
    border-width: 2px;
  }
  &[data-size='medium'] {
    width: 30px;
    height: 30px;
    border-width: 3px;
  }
  &[data-size='large'] {
    width: 48px;
    height: 48px;
    border-width: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2s;
  }
`

const Label = styled.span`
  font-size: 14px;
  font-weight: 600;
`

/**
 * A centered loading spinner with an optional label. Always centers itself along both axes within
 * its container, in either a row (spinner beside label) or column (spinner above label) layout.
 * Honors prefers-reduced-motion. The label doubles as the accessible name; with no label the whole
 * thing is announced generically as "Loading".
 */
export function Spinner({ label, size = 'medium', direction = 'column', className }: SpinnerProps) {
  return (
    <Box
      className={className}
      data-testid="spinner-box"
      data-direction={direction}
      role="status"
      aria-live="polite"
      aria-label={label ? undefined : 'Loading'}
    >
      <Ring data-testid="spinner-box-ring" data-size={size} aria-hidden />
      {label ? <Label>{label}</Label> : null}
    </Box>
  )
}

export default Spinner
