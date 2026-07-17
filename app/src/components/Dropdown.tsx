import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import './dropdown.css'

export type DropdownOption = { value: string; label: ReactNode }

// Reusable select-style dropdown: a bordered trigger + a menu of single-select options. Styled as the
// design's white rounded pill (gray border → purple on keyboard focus → light-gray gradient when open).
// Self-manages open/close (outside-click + Escape) by default; pass `open`/`onOpenChange` to control it
// externally — e.g. so the FilterBar can keep only one filter popover open at a time. Meant to be the
// shared primitive for filters and forms, not a one-off.
export function Dropdown({
  options,
  value,
  onChange,
  label,
  placeholder,
  align = 'left',
  className = '',
  ariaLabel,
  open: openProp,
  onOpenChange
}: {
  options: DropdownOption[]
  value?: string
  onChange: (value: string) => void
  /** Fixed trigger text (e.g. "Sort by"). Omit to show the selected option's label instead. */
  label?: ReactNode
  /** Trigger text when nothing is selected and no fixed `label` is given. */
  placeholder?: ReactNode
  align?: 'left' | 'right'
  className?: string
  ariaLabel?: string
  /** Controlled open state. Omit for self-managed open/close. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const ref = useRef<HTMLDivElement>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp !== undefined) onOpenChangeRef.current?.(next)
      else setOpenState(next)
    },
    [openProp]
  )

  const selected = options.find(o => o.value === value)
  const triggerLabel = label ?? selected?.label ?? placeholder

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return (
    <div className={`dropdown${className ? ` ${className}` : ''}`} ref={ref}>
      <button
        type="button"
        className={`dropdown__trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <span className="dropdown__label">{triggerLabel}</span>
        <span className={`ico ico-chevron dropdown__chev${open ? ' is-up' : ''}`} aria-hidden />
      </button>

      {open ? (
        <ul className={`dropdown__menu dropdown__menu--${align}`} role="listbox">
          {options.map(o => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dropdown__option${o.value === value ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default Dropdown
