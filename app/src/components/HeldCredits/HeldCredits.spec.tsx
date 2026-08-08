import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeldCredits } from './HeldCredits'
import type { HeldCredits as Held } from '~/lib/credits'

// A fixed "now" so the countdown is deterministic.
const NOW_SECONDS = 1_800_000_000

function heldAt(secondsFromNow: number, credits = 3): Held {
  return {
    cents: credits * 10,
    credits,
    releasesAtSeconds: NOW_SECONDS + secondsFromNow,
    heldUntilSeconds: NOW_SECONDS + secondsFromNow + 3300,
    purchases: [
      {
        credits,
        releasesAtSeconds: NOW_SECONDS + secondsFromNow,
        contractAddress: '0xabc',
        itemId: '1'
      }
    ]
  }
}

// Presentational on purpose: the refetch that eventually clears the badge lives in useBalance, so this
// component needs no react-query context and the navbar can render it without one.
function renderBadge(held: Held | undefined) {
  return render(<HeldCredits held={held} />)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW_SECONDS * 1000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('when nothing is held', () => {
  it('should render nothing at all', () => {
    const { container } = renderBadge(undefined)

    expect(container).toBeEmptyDOMElement()
  })

  // The server omits the block entirely, but a zero must not render an empty badge either.
  it('should render nothing when the held amount rounds to zero credits', () => {
    const { container } = renderBadge({ ...heldAt(120), credits: 0, cents: 0 })

    expect(container).toBeEmptyDOMElement()
  })
})

describe('when credits are held', () => {
  it('should say how many, without the buyer having to open anything', () => {
    renderBadge(heldAt(300))

    expect(screen.getByTestId('held-credits-trigger')).toHaveTextContent('3 on hold')
  })

  it('should explain why and count down to the soonest they can return', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBadge(heldAt(125))

    await user.click(screen.getByTestId('held-credits-trigger'))

    expect(screen.getByTestId('held-credits-panel')).toHaveTextContent('A purchase you started is still using them.')
    expect(screen.getByTestId('held-credits-countdown')).toHaveTextContent('2:05')
  })

  it('should tick down as time passes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBadge(heldAt(125))
    await user.click(screen.getByTestId('held-credits-trigger'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    await waitFor(() => expect(screen.getByTestId('held-credits-countdown')).toHaveTextContent('2:00'))
  })

  /**
   * The whole reason this is a countdown to the EARLIEST rather than a promise. A reservation the credits
   * squid cannot vouch for is deliberately held past it, so claiming the money is back — or showing a
   * negative timer — would be wrong in exactly the case that already made a buyer think we took it.
   */
  it('should never claim the credits are back once the countdown runs out', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBadge(heldAt(2))
    await user.click(screen.getByTestId('held-credits-trigger'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    await waitFor(() => expect(screen.getByTestId('held-credits-due')).toHaveTextContent('Back any moment now'))
    expect(screen.queryByTestId('held-credits-countdown')).not.toBeInTheDocument()
    // Still on hold: the badge does not disappear on a clock alone, only on a fresh balance.
    expect(screen.getByTestId('held-credits-trigger')).toBeInTheDocument()
  })

  it('should state the worst case rather than imply the countdown is a guarantee', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBadge(heldAt(300))

    await user.click(screen.getByTestId('held-credits-trigger'))

    expect(screen.getByTestId('held-credits-panel')).toHaveTextContent('can take up to an hour')
  })
})
