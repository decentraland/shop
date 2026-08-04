import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { LoadMore } from './LoadMore'

/**
 * THE INFINITE SCROLL TRIGGER, WHICH USED TO BE AN INFINITE REQUEST LOOP.
 *
 * react-query keeps the pages it already has when a next-page fetch fails, so `hasNextPage` stays true and
 * `isFetchingNextPage` drops back to false — with the sentinel still on screen (and one grid-row shorter than
 * before, because the loading skeletons just went away). The only guard here was `!isFetching`, so the released
 * guard plus a re-created observer meant the same failed offset was requested again, and again, for as long as
 * the tab stayed open. Both halves are pinned below: the error stand-down, and the observer NOT being rebuilt
 * on every render of the host page (which is what delivered the repeat intersections).
 */

type IoCallback = (entries: Array<{ isIntersecting: boolean }>) => void

/** Fake IntersectionObserver: jsdom has none, and the point of these tests is when it fires. */
class FakeIo {
  static instances: FakeIo[] = []
  observed = 0
  disconnected = 0
  constructor(private cb: IoCallback) {
    FakeIo.instances.push(this)
  }
  observe() {
    this.observed += 1
    // The real thing queues an initial notification for an already-intersecting target — the behaviour that
    // made a rebuilt observer fire again, so it must be modelled rather than only triggered on demand.
    this.fire(true)
  }
  disconnect() {
    this.disconnected += 1
  }
  unobserve() {}
  takeRecords() {
    return []
  }
  fire(isIntersecting: boolean) {
    act(() => this.cb([{ isIntersecting }]))
  }
}

const observerCount = () => FakeIo.instances.length
const original = globalThis.IntersectionObserver

beforeEach(() => {
  FakeIo.instances = []
  globalThis.IntersectionObserver = FakeIo as unknown as typeof IntersectionObserver
})
afterEach(() => {
  globalThis.IntersectionObserver = original
})

describe('LoadMore', () => {
  it('should ask for the next page when the sentinel comes into view', () => {
    const onLoadMore = vi.fn()
    render(<LoadMore hasNextPage isFetching={false} onLoadMore={onLoadMore} />)

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('should render nothing at all once there is no next page', () => {
    const { container } = render(<LoadMore hasNextPage={false} isFetching={false} onLoadMore={vi.fn()} />)

    expect(container.firstChild).toBeNull()
    expect(observerCount()).toBe(0)
  })

  it('should not observe at all while a page is in flight', () => {
    const onLoadMore = vi.fn()
    render(<LoadMore hasNextPage isFetching onLoadMore={onLoadMore} />)

    expect(observerCount()).toBe(0)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  describe('when the host page re-renders without scrolling', () => {
    /**
     * Every call site passes an inline arrow, and the browse page re-renders on the MANA-rate poll alone. With
     * the callback in the dependency list, each of those renders tore the observer down and built a new one —
     * whose observe() re-reports the still-intersecting sentinel. One observer, one request.
     */
    it('should keep the same observer and not re-request the page', () => {
      const { rerender } = render(<LoadMore hasNextPage isFetching={false} onLoadMore={vi.fn()} />)
      const first = FakeIo.instances[0]

      // A fresh callback identity each time, exactly as `onLoadMore={() => void fetchNextPage()}` produces.
      const later = vi.fn()
      rerender(<LoadMore hasNextPage isFetching={false} onLoadMore={later} />)
      rerender(<LoadMore hasNextPage isFetching={false} onLoadMore={vi.fn()} />)

      expect(observerCount()).toBe(1)
      expect(first.disconnected).toBe(0)
      expect(later).not.toHaveBeenCalled()
    })

    it('should still call the LATEST callback when it does fire', () => {
      const stale = vi.fn()
      const { rerender } = render(<LoadMore hasNextPage isFetching onLoadMore={stale} />)
      const fresh = vi.fn()

      rerender(<LoadMore hasNextPage isFetching={false} onLoadMore={fresh} />)

      expect(fresh).toHaveBeenCalledTimes(1)
      expect(stale).not.toHaveBeenCalled()
    })
  })

  describe('when a next-page fetch has failed', () => {
    // The sequence the loop came from: fetching → failed. `hasNextPage` is still true throughout, because the
    // pages already on screen are fine.
    const failNextPage = (onLoadMore: () => void) => {
      const { rerender } = render(<LoadMore hasNextPage isFetching onLoadMore={onLoadMore} />)
      rerender(<LoadMore hasNextPage isFetching={false} isError onLoadMore={onLoadMore} />)
      return rerender
    }

    it('should stop auto-loading instead of re-requesting the offset that just failed', () => {
      const onLoadMore = vi.fn()
      const rerender = failNextPage(onLoadMore)

      expect(observerCount()).toBe(0)
      expect(onLoadMore).not.toHaveBeenCalled()

      // …and it stays stood down however many times the page re-renders underneath it.
      rerender(<LoadMore hasNextPage isFetching={false} isError onLoadMore={onLoadMore} />)
      rerender(<LoadMore hasNextPage isFetching={false} isError onLoadMore={onLoadMore} />)
      expect(observerCount()).toBe(0)
      expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('should offer a deliberate retry, and resume auto-loading once it succeeds', () => {
      const onLoadMore = vi.fn()
      const rerender = failNextPage(onLoadMore)

      const button = screen.getByRole('button')
      expect(button).toHaveTextContent(/try again/i)
      expect(button).toBeEnabled()
      act(() => button.click())
      expect(onLoadMore).toHaveBeenCalledTimes(1)

      // The retry landed: the sentinel is armed again, so scrolling keeps working.
      rerender(<LoadMore hasNextPage isFetching={false} onLoadMore={onLoadMore} />)
      expect(observerCount()).toBe(1)
      expect(onLoadMore).toHaveBeenCalledTimes(2)
    })
  })
})
