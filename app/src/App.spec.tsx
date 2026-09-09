import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AliasRedirect } from './App'

/**
 * Every in-world entry point lands on `/?utm_source=client`, so an alias that dropped the query took the
 * whole client surface's attribution with it — and any campaign tag, shared search or filter aimed at the
 * root. The landing page view is resolved by Segment long after the redirect runs, so what survives here
 * is all it ever sees.
 */
describe('AliasRedirect', () => {
  function Probe() {
    const { pathname, search, hash } = useLocation()
    return <span data-testid="location">{`${pathname}${search}${hash}`}</span>
  }

  function renderAt(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<AliasRedirect to="/overview" />} />
          <Route path="/overview" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('carries the query to the target', () => {
    const { getByTestId } = renderAt('/?utm_source=client')

    expect(getByTestId('location').textContent).toBe('/overview?utm_source=client')
  })

  it('keeps every parameter, not just the first', () => {
    const { getByTestId } = renderAt('/?utm_source=client&utm_campaign=sidebar&q=hat')

    expect(getByTestId('location').textContent).toBe('/overview?utm_source=client&utm_campaign=sidebar&q=hat')
  })

  it('carries the hash', () => {
    const { getByTestId } = renderAt('/?utm_source=client#faq')

    expect(getByTestId('location').textContent).toBe('/overview?utm_source=client#faq')
  })

  it('leaves a bare path clean', () => {
    const { getByTestId } = renderAt('/')

    expect(getByTestId('location').textContent).toBe('/overview')
  })

  describe('when the target carries its own query', () => {
    function renderImportAt(entry: string) {
      return render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/import" element={<AliasRedirect to="/activity?section=listings" />} />
            <Route path="/activity" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      )
    }

    it('merges both instead of gluing a second question mark', () => {
      const { getByTestId } = renderImportAt('/import?utm_source=client')

      expect(getByTestId('location').textContent).toBe('/activity?utm_source=client&section=listings')
    })

    // The target's params are the whole point of the alias, so they outrank an incoming duplicate.
    it('lets the target win a collision', () => {
      const { getByTestId } = renderImportAt('/import?section=something-else')

      expect(getByTestId('location').textContent).toBe('/activity?section=listings')
    })

    // Splitting on every '?' would drop `b=2` here, and so would split('?', 2) — its limit caps the array
    // rather than stopping the split.
    it('keeps everything past a second question mark', () => {
      const { getByTestId } = render(
        <MemoryRouter initialEntries={['/import']}>
          <Routes>
            <Route path="/import" element={<AliasRedirect to="/activity?a=1?b=2" />} />
            <Route path="/activity" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      )

      expect(getByTestId('location').textContent).toBe('/activity?a=1%3Fb%3D2')
    })
  })
})
