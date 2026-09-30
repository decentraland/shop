import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef, useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RangePicker, type RangePickerHandle } from '~/components/RangePicker'

const DAY = 86_400_000
const TO = new Date(2026, 8, 30).getTime()

/** The page's wiring: the trigger opens the picker, and closes it through the picker's own handle. */
function Harness({
  onPick = () => {},
  onApply = () => {}
}: {
  onPick?: (key: string) => void
  onApply?: (from: number, to: number) => void
}) {
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
          onApply={(from, to) => {
            onApply(from, to)
            setOpen(false)
          }}
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

/** A stand-in for `Element.animate`, which jsdom lacks, whose animations finish when the test says so. */
function stubAnimate() {
  const running: { onfinish: (() => void) | null; cancel: () => void }[] = []
  const original = HTMLElement.prototype.animate
  HTMLElement.prototype.animate = function () {
    // Cancelled animations leave the list, as a browser fires `cancel` for them and never `finish`.
    const animation = {
      onfinish: null as (() => void) | null,
      cancel: () => {
        running.splice(running.indexOf(animation), 1)
      }
    }
    running.push(animation)
    return animation as unknown as Animation
  }
  return {
    finishAll: () =>
      act(() => {
        for (const animation of running.splice(0)) animation.onfinish?.()
      }),
    restore: () => {
      HTMLElement.prototype.animate = original
    }
  }
}

describe('when the picker animates its way out', () => {
  let animations: ReturnType<typeof stubAnimate>
  beforeEach(() => {
    animations = stubAnimate()
  })
  afterEach(() => animations.restore())

  it('should stay open until its fold finishes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    await user.keyboard('{Escape}')
    expect(picker()).not.toBeNull()

    animations.finishAll()
    expect(picker()).toBeNull()
  })

  it('should leave focus on what was pressed to close it, rather than pulling it back to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness />
        <input aria-label="Search" />
      </>
    )
    await user.click(screen.getByRole('button', { name: 'Period' }))
    const search = screen.getByRole('textbox', { name: 'Search' })
    fireEvent.pointerDown(search)
    search.focus()

    animations.finishAll()
    expect(picker()).toBeNull()
    expect(document.activeElement).toBe(search)
  })

  it('should give focus back to the trigger when it closes from inside', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    animations.finishAll()
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    animations.finishAll()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Period' }))
  })

  it('should close once when the trigger is pressed again mid-fold', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    animations.finishAll()
    await user.click(screen.getByTestId('store-period-7d'))
    await user.click(screen.getByRole('button', { name: 'Period' }))

    animations.finishAll()
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(picker()).toBeNull()
  })

  it('should not run the close callback when unmounted mid-fold', () => {
    const handle = createRef<RangePickerHandle>()
    const onClose = vi.fn()
    const { unmount } = render(
      <>
        <button type="button" data-range-trigger="">
          Period
        </button>
        <RangePicker handle={handle} from={TO - DAY} to={TO} max={TO} onApply={() => {}} onClose={onClose} />
      </>
    )
    act(() => handle.current?.close())
    unmount()

    animations.finishAll()
    expect(onClose).not.toHaveBeenCalled()
  })
})

const day = (n: number) => screen.getByRole('option', { name: new RegExp(`September ${n}(st|nd|rd|th), 2026`) })

describe('when a custom range is picked', () => {
  it('should apply the two days picked, and only once Apply is pressed', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<Harness onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    await user.click(day(10))
    await user.click(day(14))
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('store-range-apply'))
    expect(onApply).toHaveBeenCalledTimes(1)
    const [from, to] = onApply.mock.calls[0]
    expect(new Date(from).getDate()).toBe(10)
    expect(new Date(to).getDate()).toBe(14)
    expect(picker()).toBeNull()
  })
})

describe('when the picker animates and the viewer is fine with motion', () => {
  let animations: ReturnType<typeof stubAnimate>
  beforeEach(() => {
    animations = stubAnimate()
  })
  afterEach(() => {
    animations.restore()
    vi.useRealTimers()
  })

  it('should run Apply after the fold, not before it', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<Harness onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    animations.finishAll()
    await user.click(day(10))
    await user.click(day(14))
    await user.click(screen.getByTestId('store-range-apply'))
    expect(onApply).not.toHaveBeenCalled()

    animations.finishAll()
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('should swallow a second press on the panel while it folds', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    const outside = vi.fn()
    render(<Harness onPick={onPick} />)
    document.addEventListener('click', outside)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    animations.finishAll()
    await user.click(screen.getByTestId('store-period-7d'))
    outside.mockClear()
    await user.click(screen.getByTestId('store-period-30d'))
    expect(outside).not.toHaveBeenCalled()

    animations.finishAll()
    document.removeEventListener('click', outside)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('7d')
  })

  it('should close mid-grow', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    await user.keyboard('{Escape}')

    animations.finishAll()
    expect(picker()).toBeNull()
  })

  it('should still close when the fold never reports that it finished', () => {
    vi.useFakeTimers()
    const handle = createRef<RangePickerHandle>()
    const onClose = vi.fn()
    render(
      <>
        <button type="button" data-range-trigger="">
          Period
        </button>
        <RangePicker handle={handle} from={TO - DAY} to={TO} max={TO} onApply={() => {}} onClose={onClose} />
      </>
    )
    act(() => handle.current?.close())
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    animations.finishAll()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('when the viewer asks for reduced motion', () => {
  let animations: ReturnType<typeof stubAnimate>
  const original = window.matchMedia
  beforeEach(() => {
    animations = stubAnimate()
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    animations.restore()
    window.matchMedia = original
  })

  it('should close at once, without waiting on an animation', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    await user.keyboard('{Escape}')
    expect(picker()).toBeNull()
  })
})

describe('when the picker opens', () => {
  it('should focus the preset in force', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Period' }))
    expect(document.activeElement).toBe(screen.getByTestId('store-period-30d'))
  })

  it('should focus a calendar day when no preset is in force', () => {
    render(<RangePicker from={TO - 3 * DAY} to={TO} max={TO} onApply={() => {}} onClose={() => {}} />)
    expect(document.activeElement?.getAttribute('role')).toBe('option')
  })
})
