import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ScrollReset } from './ScrollReset'

/**
 * The reset only applies to a NEW navigation. A back/forward is the browser restoring a position the user
 * was already at, and yanking them to the top there is worse than the bug this fixes: they would lose
 * their place in a long grid every time they came back from an item.
 */
describe('ScrollReset', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function Nav({ to, action }: { to: string; action: 'push' | 'back' }) {
    const navigate = useNavigate()
    return (
      <button
        onClick={() => {
          if (action === 'back') navigate(-1)
          else navigate(to)
        }}
      >
        go
      </button>
    )
  }

  it('scrolls a freshly-navigated page to the top', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/items']}>
        <ScrollReset />
        <Routes>
          <Route path="/items" element={<Nav to="/cart" action="push" />} />
          <Route path="/cart" element={<p>cart</p>} />
        </Routes>
      </MemoryRouter>
    )

    scrollTo.mockClear() // ignore the initial render
    fireEvent.click(getByText('go'))

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('leaves the scroll alone on back/forward, so a long grid keeps its place', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/items', '/item/1']} initialIndex={1}>
        <ScrollReset />
        <Routes>
          <Route path="/items" element={<p>grid</p>} />
          <Route path="/item/1" element={<Nav to="/items" action="back" />} />
        </Routes>
      </MemoryRouter>
    )

    scrollTo.mockClear()
    fireEvent.click(getByText('go'))

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll when only the query string changes', () => {
    // Paging and filtering the grid rewrite the search params; moving the viewport mid-browse would be
    // the opposite of helpful.
    const { getByText } = render(
      <MemoryRouter initialEntries={['/items']}>
        <ScrollReset />
        <Routes>
          <Route path="/items" element={<Nav to="/items?page=2" action="push" />} />
        </Routes>
      </MemoryRouter>
    )

    scrollTo.mockClear()
    fireEvent.click(getByText('go'))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
