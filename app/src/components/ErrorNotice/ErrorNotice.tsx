import { Icon } from '~/components/Icon'

// Shared inline error banner: a consistent, styled notice (alert icon + tinted surface) for the
// ad-hoc red `<p className="error">` text that used to sit bare across pages and modals. Renders
// nothing when there's no message, so callers can pass a nullable value directly. `role="alert"`
// so screen readers announce it when it appears.

export function ErrorNotice({
  message,
  className,
  testId
}: {
  message?: string | null
  className?: string
  /** Stable test hook — tests select the notice by this instead of the presentational class. */
  testId?: string
}) {
  if (!message) return null
  return (
    <p className={className ? `error-notice ${className}` : 'error-notice'} data-testid={testId} role="alert">
      <Icon name="alert" className="error-notice__ico" size={18} />
      <span className="error-notice__msg">{message}</span>
    </p>
  )
}

export default ErrorNotice
