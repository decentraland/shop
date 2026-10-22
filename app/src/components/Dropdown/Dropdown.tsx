import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Chevron } from '~/components/Chevron'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import { nextActiveIndex } from '~/lib/suggestionNavigation'
import { theme } from '~/styles/theme'
import * as S from './Dropdown.styles'

export type DropdownOption = {
  value: string
  label: ReactNode
  /** A picture beside the label in the menu, never in the trigger. */
  media?: ReactNode
  /** A quieter second line under the label in the menu. */
  hint?: ReactNode
}

const textOf = (option: DropdownOption) => (typeof option.label === 'string' ? option.label : option.value)

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
  onOpenChange,
  searchPlaceholder
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
  /** Puts a search field above the options, for lists long enough to need one. */
  searchPlaceholder?: string
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

  const searchable = searchPlaceholder != null
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const optionId = (optionValue: string) => `${listId}-${encodeURIComponent(optionValue)}`
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [shift, setShift] = useState(0)

  // A menu wider than its trigger slides along it just far enough to stay on screen, keeping its edge on
  // the trigger's when it can.
  useLayoutEffect(() => {
    if (!open) return setShift(0)
    const place = () => {
      if (!menuRef.current || !triggerRef.current) return
      const trigger = triggerRef.current.getBoundingClientRect()
      const width = menuRef.current.offsetWidth
      const gutter = 16
      const left = align === 'left' ? trigger.left : trigger.right - width
      setShift(Math.min(Math.max(left, gutter), window.innerWidth - gutter - width) - left)
    }
    place()
    // Focused here rather than by autoFocus, which ran before the shift and scrolled the page sideways to
    // reach the menu's overhang.
    searchRef.current?.focus({ preventScroll: true })
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, align])

  const needle = query.trim().toLocaleLowerCase()
  const shown = needle ? options.filter(o => textOf(o).toLocaleLowerCase().includes(needle)) : options
  // Clamped on read, so a list that shrinks while open (a refetch, a narrower query) never strands it.
  const active = Math.min(highlight, shown.length - 1)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    // Opens on the current choice, so a long list doesn't start back at the top.
    const index = options.findIndex(o => o.value === value)
    setHighlight(Math.max(index, 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening
  }, [open])

  useEffect(() => {
    if (!searchable) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open, searchable])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const selected = options.find(o => o.value === value)
  const triggerLabel = label ?? selected?.label ?? placeholder

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // The search field that held focus unmounts with the menu; without this, focus falls to the page.
      if (ref.current?.contains(document.activeElement)) triggerRef.current?.focus()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return (
    <S.Root className={className || undefined} ref={ref}>
      <S.Trigger
        ref={triggerRef}
        type="button"
        data-dropdown-trigger
        data-open={open || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <S.Label>{triggerLabel}</S.Label>
        <Chevron up={open} size={24} color={theme.colors.softWhite} />
      </S.Trigger>

      {open ? (
        <S.Menu
          ref={menuRef}
          data-align={align}
          data-searchable={searchable || undefined}
          style={shift ? { translate: `${shift}px 0` } : undefined}
        >
          {searchable ? (
            <S.Search>
              <Icon name="search" size={16} color={theme.colors.muted} aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(shown[active].value) : undefined}
                onChange={event => {
                  setQuery(event.target.value)
                  setHighlight(0)
                }}
                onKeyDown={event => {
                  // Keys inside an IME composition belong to the text being typed.
                  if (event.nativeEvent.isComposing || event.key === 'Process') return
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    setHighlight(nextActiveIndex(active, shown.length, event.key) ?? active)
                  } else if (event.key === 'Enter' && active >= 0) {
                    event.preventDefault()
                    choose(shown[active].value)
                    triggerRef.current?.focus()
                  } else if (event.key === 'Tab') {
                    // The options take no tab stop, so Tab leaves the dropdown: the menu goes with it.
                    setOpen(false)
                  }
                }}
                data-testid="dropdown-search"
              />
            </S.Search>
          ) : null}
          <S.List ref={listRef} id={listId} role="listbox">
            {shown.map((o, index) => (
              <li key={o.value} role="none">
                <S.Option
                  type="button"
                  role="option"
                  id={optionId(o.value)}
                  data-index={index}
                  aria-selected={o.value === value}
                  data-active={o.value === value || undefined}
                  data-highlight={(searchable && index === active) || undefined}
                  tabIndex={searchable ? -1 : undefined}
                  onMouseMove={searchable ? () => setHighlight(index) : undefined}
                  data-rich={o.media || o.hint ? '' : undefined}
                  onClick={() => choose(o.value)}
                >
                  {o.media ? <S.OptionMedia>{o.media}</S.OptionMedia> : null}
                  <S.OptionText>
                    <span>{o.label}</span>
                    {o.hint ? <small>{o.hint}</small> : null}
                  </S.OptionText>
                </S.Option>
              </li>
            ))}
            {shown.length === 0 ? (
              <S.Empty role="none" aria-hidden data-testid="dropdown-empty">
                {t('common.noMatches')}
              </S.Empty>
            ) : null}
          </S.List>
          {/* Always rendered, so a screen reader hears the text change rather than a region appearing. */}
          {searchable ? <S.Status role="status">{shown.length === 0 ? t('common.noMatches') : ''}</S.Status> : null}
        </S.Menu>
      ) : null}
    </S.Root>
  )
}

export default Dropdown
