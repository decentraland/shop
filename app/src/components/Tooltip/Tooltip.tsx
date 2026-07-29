import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
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

/** Distance from the trigger, and the minimum clearance kept from the viewport edges. */
const GAP = 8
const EDGE = 8

type Pos = { left: number; top: number; arrow: number }

// Lightweight hover/focus tooltip. Deliberately not decentraland-ui2's (MUI) Tooltip: the shop keeps MUI
// out of the eager chunks (see LazyWearablePreview), and we need an onShow hook for Segment tracking.
// The bubble is portalled to <body> and placed in viewport coordinates. Anchored inside the trigger it
// was cropped by any scrolling ancestor — the browse filter sidebar cut the SMART hint off mid-word.
export function Tooltip({ content, children, placement = 'top', block, onShow, className }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const id = useId()
  const shown = useRef(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    setOpen(true)
    if (!shown.current) {
      shown.current = true
      onShow?.()
    }
  }, [onShow])
  const hide = useCallback(() => setOpen(false), [])

  // Centre the bubble on the trigger, then pull it back inside the viewport when it would spill off a
  // narrow screen. The arrow keeps pointing at the trigger, so clamping never orphans the bubble.
  const place = useCallback(() => {
    const wrap = wrapRef.current
    const bubble = bubbleRef.current
    if (!wrap || !bubble) return
    const trigger = wrap.getBoundingClientRect()
    const half = bubble.offsetWidth / 2
    const centre = trigger.left + trigger.width / 2
    const min = half + EDGE
    const left = Math.min(Math.max(centre, min), Math.max(min, window.innerWidth - min))
    setPos({
      left,
      top: placement === 'top' ? trigger.top - GAP : trigger.bottom + GAP,
      arrow: centre - left
    })
  }, [placement])

  useLayoutEffect(() => {
    if (open) place()
  }, [content, open, place])

  // Keep up with the trigger while an ancestor scrolls (capture: scroll doesn't bubble) or on resize.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <S.Wrap
      ref={wrapRef}
      className={className}
      block={block}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {createPortal(
        <S.Bubble
          ref={bubbleRef}
          role="tooltip"
          id={id}
          placement={placement}
          aria-hidden={!open}
          style={
            { left: pos?.left ?? 0, top: pos?.top ?? 0, '--tooltip-arrow': `${pos?.arrow ?? 0}px` } as CSSProperties
          }
          {...(open && pos ? { 'data-open': '' } : {})}
        >
          {content}
        </S.Bubble>,
        document.body
      )}
    </S.Wrap>
  )
}
