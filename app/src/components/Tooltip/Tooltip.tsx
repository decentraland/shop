import { cloneElement, useCallback, useId, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import * as S from './Tooltip.styles'

type Props = {
  /** Bubble content. */
  content: ReactNode
  /** The trigger element (must accept `aria-describedby`). */
  children: ReactElement
  placement?: 'top' | 'bottom'
  /** Stretch the wrapper to full width (for block-level triggers). */
  block?: boolean
  /** Fired the first time the tooltip opens for this mount — used for analytics. */
  onShow?: () => void
  className?: string
}

// Lightweight hover/focus tooltip. Deliberately not decentraland-ui2's (MUI) Tooltip: the shop keeps MUI
// out of the eager chunks (see LazyWearablePreview), and we need an onShow hook for Segment tracking.
export function Tooltip({ content, children, placement = 'top', block, onShow, className }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const shown = useRef(false)

  const show = useCallback(() => {
    setOpen(true)
    if (!shown.current) {
      shown.current = true
      onShow?.()
    }
  }, [onShow])
  const hide = useCallback(() => setOpen(false), [])

  return (
    <S.Wrap className={className} block={block} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      <S.Bubble role="tooltip" id={id} placement={placement} aria-hidden={!open} {...(open ? { 'data-open': '' } : {})}>
        {content}
      </S.Bubble>
    </S.Wrap>
  )
}
