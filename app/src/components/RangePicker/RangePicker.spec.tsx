import { describe, it, expect, vi } from 'vitest'
import { createRef, useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RangePicker, type RangePickerHandle } from '~/components/RangePicker'

const DAY = 86_400_000
const TO = new Date(2026, 8, 30).getTime()

/** The page's wiring: the trigger opens the picker, and closes it through the picker's own handle. */
function Harness({ onPick = () => {} }: { onPick?: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const picker = useRef<RangePickerHandle>(null)
  return (
    <>
      <button
        type="button"
        data-range-trigger=""
        aria-expanded={open}
        onClick={() => (open ? picker.current?.close() : setOpen(true))}
      >
        Period
      </button>
      {open ? (
        <RangePicker
          handle={picker}
          from={TO - 29 * DAY}
          to={TO}
          max={TO}
          presets={['7d', '30d'].map(key => ({
            key,
            label: key,
            active: key === '30d',
            onPick: () => {
              onPick(key)
              setOpen(false)
            }
          }))}
          onApply={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

const picker = () => screen.queryByTestId('store-range-picker')

describe('when the picker is open', () => {
  it('should close from its trigger and stay closed, rather than reopening on the same press', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    expect(picker()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Period' }))
    expect(picker()).toBeNull()
  })

  it('should apply a preset at once and close', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: 'Period' }))

    expect(screen.getByTestId('store-period-30d').getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByTestId('store-period-7d'))
    expect(onPick).toHaveBeenCalledWith('7d')
    expect(picker()).toBeNull()
  })

  it('should close on Escape and on a press outside it', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness />
        <p>outside</p>
      </>
    )
    await user.click(screen.getByRole('button', { name: 'Period' }))
    await user.keyboard('{Escape}')
    expect(picker()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Period' }))
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(picker()).toBeNull()
  })
})

describe('when a caller closes it through its handle', () => {
  it('should run onClose', () => {
    const handle = createRef<RangePickerHandle>()
    const onClose = vi.fn()
    render(<RangePicker handle={handle} from={TO - DAY} to={TO} max={TO} onApply={() => {}} onClose={onClose} />)
    handle.current?.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
