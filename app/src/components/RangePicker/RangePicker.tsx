import { useEffect, useRef, useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { activeLocale, t } from '~/intl/i18n'
import { breakpoints } from '~/styles/theme'
import * as S from './RangePicker.styles'

const WIDE = `(min-width: ${breakpoints.sm}px)`

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches)
  useEffect(() => {
    const list = window.matchMedia?.(WIDE)
    if (!list) return
    const onChange = () => setWide(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return !!wide
}

/** With two months shown, the one holding the range goes on the right, so the month before it is the left one. */
function openOn(date: Date, twoMonths: boolean): Date {
  if (!twoMonths) return date
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}

/**
 * A two-click range picker in the Shop's calendar, opened from a trigger it sits under.
 *
 * Nothing changes until Apply: picking the first day of a range is half a choice, and re-reading the whole
 * dashboard on it would redraw every figure for a range nobody asked for.
 */
export function RangePicker({
  from,
  to,
  max,
  onApply,
  onClose
}: {
  from: number | undefined
  to: number | undefined
  max: number
  onApply: (from: number, to: number) => void
  onClose: () => void
}) {
  const [start, setStart] = useState<Date | null>(from != null ? new Date(from) : null)
  const [end, setEnd] = useState<Date | null>(to != null ? new Date(to) : null)
  const ref = useRef<HTMLDivElement>(null)
  const wide = useWide()

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
      // The trigger toggles the picker itself; closing here as well would reopen it on the same click.
      if ((target as Element).closest?.('[data-range-trigger]')) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !ref.current) return
      // Keeps Tab inside the dialog while it is open, wrapping at either end.
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Focus goes in on open and back to the trigger on every way out, so a keyboard user is never left behind.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const day = ref.current?.querySelector<HTMLElement>('.react-datepicker__day[tabindex="0"]')
    ;(day ?? ref.current)?.focus()
    return () => {
      const fallback = document.querySelector<HTMLElement>('[data-range-trigger]')
      ;(trigger?.isConnected ? trigger : fallback)?.focus()
    }
  }, [])

  const format = new Intl.DateTimeFormat(activeLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
  const summary = start
    ? end
      ? `${format.format(start)} – ${format.format(end)}`
      : t('myStore.rangePickEnd', { from: format.format(start) })
    : t('myStore.rangePickStart')

  return (
    <S.Root
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={t('myStore.rangeDialog')}
      tabIndex={-1}
      data-testid="store-range-picker"
    >
      <DatePicker
        inline
        selectsRange
        startDate={start}
        endDate={end}
        onChange={([nextStart, nextEnd]) => {
          setStart(nextStart)
          setEnd(nextEnd)
        }}
        maxDate={new Date(max)}
        monthsShown={wide ? 2 : 1}
        openToDate={openOn(end ?? start ?? new Date(max), wide)}
        calendarStartDay={1}
      />
      <S.Foot>
        <span data-testid="store-range-summary">{summary}</span>
        <S.Actions>
          <S.Btn type="button" onClick={onClose}>
            {t('myStore.rangeCancel')}
          </S.Btn>
          <S.Btn
            type="button"
            data-variant="primary"
            disabled={!start || !end}
            onClick={() => start && end && onApply(start.getTime(), end.getTime())}
            data-testid="store-range-apply"
          >
            {t('myStore.rangeApply')}
          </S.Btn>
        </S.Actions>
      </S.Foot>
    </S.Root>
  )
}
