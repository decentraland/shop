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
      <svg className="error-notice__ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2 1 21h22L12 2zm0 6a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1zm0 8.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z" />
      </svg>
      <span className="error-notice__msg">{message}</span>
    </p>
  )
}

export default ErrorNotice
