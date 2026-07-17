import './spinner.css'

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

/**
 * A centered loading spinner with an optional label. Always centers itself along both axes within
 * its container, in either a row (spinner beside label) or column (spinner above label) layout.
 * Reuses the shared `spin` keyframes (index.css) and honors prefers-reduced-motion. The label doubles
 * as the accessible name; with no label the whole thing is announced generically as "Loading".
 */
export function Spinner({ label, size = 'medium', direction = 'column', className }: SpinnerProps) {
  return (
    <div
      className={`spinner-box spinner-box--${direction}${className ? ` ${className}` : ''}`}
      data-testid="spinner-box"
      data-direction={direction}
      role="status"
      aria-live="polite"
      aria-label={label ? undefined : 'Loading'}
    >
      <span
        className={`spinner-box__ring spinner-box__ring--${size}`}
        data-testid="spinner-box-ring"
        data-size={size}
        aria-hidden
      />
      {label ? <span className="spinner-box__label">{label}</span> : null}
    </div>
  )
}

export default Spinner
