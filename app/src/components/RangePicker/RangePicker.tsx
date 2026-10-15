import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import DatePicker, { type ReactDatePickerCustomHeaderProps } from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { useMorphFrom } from '~/hooks/useMorphFrom'
import { activeLocale, t } from '~/intl/i18n'
import { breakpoints } from '~/styles/theme'
import * as S from './RangePicker.styles'

// One px past `sm`, so the two-month calendar and the phone's stacked presets never both apply.
const WIDE = `(min-width: ${breakpoints.sm + 1}px)`

/** Before the first sale any store can have, so a stray click decades back cannot ask the chart for thousands of points. */
const EARLIEST = new Date(2020, 0, 1)

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

const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth()

/**
 * A month's header with month and year selects on the first column, and arrows on the outer ones.
 *
 * The library's own selects read its internal date, which is the RIGHT column after a day there is clicked,
 * so they named the wrong month. These read the column's `monthDate`, and a pick moves the calendar by the
 * difference instead of setting the month outright, which keeps whichever column the library anchors on.
 */
function MonthYearHeader({
  monthDate,
  date,
  customHeaderCount,
  monthsShown,
  min,
  max,
  changeMonth,
  changeYear,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled
}: ReactDatePickerCustomHeaderProps & { monthsShown: number; min: Date; max: Date }) {
  const first = customHeaderCount === 0
  const last = customHeaderCount === monthsShown - 1
  const go = (year: number, month: number) => {
    const target = monthIndex(date) + (year * 12 + month - monthIndex(monthDate))
    changeYear(Math.floor(target / 12))
    changeMonth(target % 12)
  }
  const monthName = new Intl.DateTimeFormat(activeLocale(), { month: 'long' })
  const title = new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric' })
  const year = monthDate.getFullYear()
  const years = Array.from({ length: max.getFullYear() - min.getFullYear() + 1 }, (_, i) => min.getFullYear() + i)
  // A month counts when any of its days can be picked, so the first and last months of the range stay on offer.
  const outOfRange = (y: number, m: number) => y * 12 + m < monthIndex(min) || y * 12 + m > monthIndex(max)
  return (
    <>
      {first && !prevMonthButtonDisabled ? (
        <button
          type="button"
          className="react-datepicker__navigation react-datepicker__navigation--previous"
          aria-label={t('myStore.rangePrevMonth')}
          onClick={decreaseMonth}
        >
          <span className="react-datepicker__navigation-icon react-datepicker__navigation-icon--previous" />
        </button>
      ) : null}
      {first ? (
        <S.HeaderRow>
          <select
            aria-label={t('myStore.rangeMonth')}
            value={monthDate.getMonth()}
            onChange={event => go(year, Number(event.target.value))}
            data-testid="range-month"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m} disabled={outOfRange(year, m)}>
                {monthName.format(new Date(2000, m, 1))}
              </option>
            ))}
          </select>
          <select
            aria-label={t('myStore.rangeYear')}
            value={year}
            onChange={event => {
              const next = Number(event.target.value)
              // Keeps the month, unless that month of the new year is out of range: then the nearest one in it.
              const month = Math.min(
                Math.max(monthDate.getMonth(), next === min.getFullYear() ? min.getMonth() : 0),
                next === max.getFullYear() ? max.getMonth() : 11
              )
              go(next, month)
            }}
            data-testid="range-year"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </S.HeaderRow>
      ) : (
        <S.HeaderRow className="react-datepicker__current-month">{title.format(monthDate)}</S.HeaderRow>
      )}
      {last && !nextMonthButtonDisabled ? (
        <button
          type="button"
          className="react-datepicker__navigation react-datepicker__navigation--next"
          aria-label={t('myStore.rangeNextMonth')}
          onClick={increaseMonth}
        >
          <span className="react-datepicker__navigation-icon react-datepicker__navigation-icon--next" />
        </button>
      ) : null}
    </>
  )
}

/** Lets the trigger fold the picker away through the same animation as every other way out. */
export type RangePickerHandle = { close: () => void }

/**
 * A two-click range picker in the Shop's calendar, opened from a trigger it sits under.
 *
 * Nothing changes until Apply: picking the first day of a range is half a choice, and re-reading the whole
 * dashboard on it would redraw every figure for a range nobody asked for.
 */
export function RangePicker({
  from,
  to,
  min = EARLIEST.getTime(),
  max,
  presets,
  handle,
  stretch = false,
  monthYearSelects = false,
  label = t('myStore.period'),
  triggerSelector = '[data-range-trigger]',
  testId = 'store-range',
  presetTestId = 'store-period',
  onApply,
  onClose
}: {
  from: number | undefined
  to: number | undefined
  /** The first and last days that can be picked; with no `max` the calendar runs into the future. */
  min?: number
  /** Spans its anchor's width with a single month, for a trigger too narrow for two months beside the presets. */
  stretch?: boolean
  label?: string
  /** The one element that opens this picker, which it grows out of and hands focus back to. */
  triggerSelector?: string
  testId?: string
  presetTestId?: string
  /** Ready-made ranges listed beside the calendar; picking one applies it straight away. */
  presets?: { key: string; label: string; active: boolean; onPick: () => void }[]
  handle?: Ref<RangePickerHandle>
  onApply: (from: number, to: number) => void
  onClose: () => void
} & (
  | {
      /**
       * Month and year selects in the calendar's header, for a range that can start years back: stepping a
       * month at a time to 2022 took over a hundred clicks. The year list ends at `max`, so it is required.
       */
      monthYearSelects: true
      max: number
    }
  | { monthYearSelects?: false; max?: number }
)) {
  const [start, setStart] = useState<Date | null>(from != null ? new Date(from) : null)
  const [end, setEnd] = useState<Date | null>(to != null ? new Date(to) : null)
  const ref = useRef<HTMLDivElement>(null)
  const wide = useWide()
  const twoMonths = wide && !stretch
  const leave = useMorphFrom(ref, triggerSelector)
  const close = useCallback(() => leave(onClose), [leave, onClose])
  useImperativeHandle(handle, () => ({ close }), [close])

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
      // The trigger closes the picker from its own click; closing here too would let that click reopen it.
      if ((target as Element).closest?.(triggerSelector)) return
      close()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab' || !ref.current) return
      // Keeps Tab inside the dialog while it is open, wrapping at either end.
      const focusable = [
        ...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [tabindex="0"]')
      ]
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
  }, [close, triggerSelector])

  // Focus goes in on open and back to the trigger on the way out, so a keyboard user is never left behind.
  useEffect(() => {
    const panel = ref.current
    const trigger = document.activeElement as HTMLElement | null
    // The presets come first and are the usual pick, so focus starts on the one in force.
    const preset = panel?.querySelector<HTMLElement>('[data-preset][aria-pressed="true"]')
    const day = panel?.querySelector<HTMLElement>('.react-datepicker__day[tabindex="0"]')
    ;(preset ?? day ?? panel)?.focus()
    return () => {
      // The panel unmounts after its fold, by when a press elsewhere may have focused what it pressed.
      const active = document.activeElement
      if (active && active !== document.body && !panel?.contains(active)) return
      // Safari does not focus a button on click, so the element focused at open may not be the trigger.
      const fallback = document.querySelector<HTMLElement>(triggerSelector)
      ;(trigger?.isConnected && trigger.matches(triggerSelector) ? trigger : fallback)?.focus()
    }
  }, [triggerSelector])

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
      aria-label={label}
      tabIndex={-1}
      data-stretch={stretch ? '' : undefined}
      data-selects={monthYearSelects ? '' : undefined}
      data-testid={`${testId}-picker`}
    >
      <S.Body>
        {presets?.length ? (
          <S.Presets role="group" aria-label={t('myStore.periodPresets')}>
            {presets.map(preset => (
              <S.Preset
                key={preset.key}
                type="button"
                aria-pressed={preset.active}
                data-preset=""
                onClick={() => leave(preset.onPick)}
                data-testid={`${presetTestId}-${preset.key}`}
              >
                {preset.label}
              </S.Preset>
            ))}
          </S.Presets>
        ) : null}
        <DatePicker
          inline
          selectsRange
          startDate={start}
          endDate={end}
          onChange={([nextStart, nextEnd]) => {
            setStart(nextStart)
            setEnd(nextEnd)
          }}
          maxDate={max != null ? new Date(max) : undefined}
          minDate={new Date(min)}
          monthsShown={twoMonths ? 2 : 1}
          openToDate={openOn(end ?? start ?? new Date(max ?? Date.now()), twoMonths)}
          calendarStartDay={1}
          renderCustomHeader={
            monthYearSelects && max != null
              ? header => (
                  <MonthYearHeader
                    {...header}
                    monthsShown={twoMonths ? 2 : 1}
                    min={new Date(min)}
                    max={new Date(max)}
                  />
                )
              : undefined
          }
        />
      </S.Body>
      <S.Foot>
        <span data-testid={`${testId}-summary`}>{summary}</span>
        <S.Actions>
          <S.Btn type="button" onClick={close}>
            {t('myStore.rangeCancel')}
          </S.Btn>
          <S.Btn
            type="button"
            data-variant="primary"
            disabled={!start || !end}
            onClick={() => start && end && leave(() => onApply(start.getTime(), end.getTime()))}
            data-testid={`${testId}-apply`}
          >
            {t('myStore.rangeApply')}
          </S.Btn>
        </S.Actions>
      </S.Foot>
    </S.Root>
  )
}
