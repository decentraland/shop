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

type Pos = { left: number; top: number; arrow: number; placement: 'top' | 'bottom' }

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

  // Centre the bubble on the trigger, then keep it inside the viewport: flip to the other side when the
  // preferred one has no room, and pull it back from the edges on a narrow screen. Being fixed, a bubble
  // placed off-screen could not be scrolled to — it would simply be gone.
  const place = useCallback(() => {
    const wrap = wrapRef.current
    const bubble = bubbleRef.current
    if (!wrap || !bubble) return
    const trigger = wrap.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = bubble

    const half = width / 2
    const minLeft = half + EDGE
    const centre = trigger.left + trigger.width / 2
    const left = Math.min(Math.max(centre, minLeft), Math.max(minLeft, window.innerWidth - minLeft))

    // Flip only when the other side actually has more room, so the requested placement still wins ties.
    const room = { top: trigger.top - GAP, bottom: window.innerHeight - trigger.bottom - GAP }
    const side =
      room[placement] >= height || room[placement] >= room[placement === 'top' ? 'bottom' : 'top']
        ? placement
        : placement === 'top'
          ? 'bottom'
          : 'top'
    const near = side === 'top' ? trigger.top - GAP : trigger.bottom + GAP
    // `near` is the bubble's edge closest to the trigger; the styles translate it off by its own height
    // for the top placement, so clamp the resulting box, not just the anchor.
    const top =
      side === 'top'
        ? Math.max(near, height + EDGE)
        : Math.min(near, Math.max(EDGE, window.innerHeight - height - EDGE))

    // Keep the arrow on the trigger, but inside the bubble's rounded corners.
    const reach = Math.max(0, half - 13)
    setPos({ left, top, arrow: Math.min(Math.max(centre - left, -reach), reach), placement: side })
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
          placement={pos?.placement ?? placement}
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
