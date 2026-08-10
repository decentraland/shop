import type { ReactNode } from 'react'
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard'
import { t } from '~/intl/i18n'
import * as S from './CopyButton.styles'

type Props = {
  /** The text placed on the clipboard. */
  value: string
  /** Rendered beside the icon — usually a shortened form of `value`. */
  children?: ReactNode
  /** Idle tooltip/label. Defaults to a generic "Copy". */
  label?: string
  /** Sentry flow tag for a failed clipboard write. */
  flow?: string
  size?: number
  className?: string
  testId?: string
}

/** Copy-to-clipboard control: the icon flips to a check for a moment to confirm the copy. */
export function CopyButton({
  value,
  children,
  label,
  flow = 'copy_to_clipboard',
  size = 16,
  className,
  testId
}: Props) {
  const { copied, copy } = useCopyToClipboard(flow)
  const title = copied ? t('common.copied') : (label ?? t('common.copy'))

  return (
    <S.Root
      type="button"
      onClick={() => void copy(value)}
      title={title}
      aria-label={title}
      data-copied={copied || undefined}
      className={className}
      data-testid={testId}
    >
      {children}
      {/* Keyed so the pop animation restarts on each swap. */}
      <S.Glyph key={copied ? 'ok' : 'idle'} name={copied ? 'check' : 'copy'} size={size} />
    </S.Root>
  )
}
