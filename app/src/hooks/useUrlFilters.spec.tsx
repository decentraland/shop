import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useUrlFilters } from './useUrlFilters'

/**
 * Filters had to survive a refresh, so they live in the URL. These pin the two properties that made the
 * old local state wrong (a value is readable back out of the address) and the one that would make the URL
 * unusable if it were not enforced (defaults are not written).
 */

const DEFAULTS = {
  category: 'wearable',
  subCategory: null as string | null,
  rarities: [] as string[],
  priceMin: '',
  smart: false
}

function Probe() {
  const [filters, setFilters] = useUrlFilters(DEFAULTS)
  const { search } = useLocation()
  return (
    <div>
      <span data-testid="state">{JSON.stringify(filters)}</span>
      <span data-testid="search">{search}</span>
      <button onClick={() => setFilters({ rarities: ['epic', 'rare'] })}>rarities</button>
      <button onClick={() => setFilters({ smart: true })}>smart</button>
      <button onClick={() => setFilters({ priceMin: '10' })}>price</button>
      {/* Two values in one call: the case that broke when two setters each wrote the URL. */}
      <button onClick={() => setFilters({ category: 'emote', subCategory: null })}>category</button>
      <button onClick={() => setFilters(DEFAULTS)}>clear</button>
    </div>
  )
}

function renderProbe(url = '/items') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  )
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}')
const search = () => screen.getByTestId('search').textContent ?? ''

describe('filters kept in the URL', () => {
  it('reads every value back out of the address, which is what a refresh replays', () => {
    renderProbe('/items?category=emote&subCategory=dance&rarities=epic,rare&priceMin=10&smart=true')

    expect(state()).toEqual({
      category: 'emote',
      subCategory: 'dance',
      rarities: ['epic', 'rare'],
      priceMin: '10',
      smart: true
    })
  })

  it('falls back to the default for anything the address does not carry', () => {
    renderProbe('/items?category=emote')

    expect(state()).toEqual({ ...DEFAULTS, category: 'emote' })
  })

  it('writes a chosen value, and reads it back', async () => {
    const user = userEvent.setup()
    renderProbe()

    await user.click(screen.getByText('rarities'))

    expect(search()).toContain('rarities=epic%2Crare')
    expect(state().rarities).toEqual(['epic', 'rare'])
  })

  // A URL only carries what the reader chose: "no filters" then has exactly one spelling, and a shared
  // link is short.
  it('never spells out a value that equals its default', async () => {
    const user = userEvent.setup()
    renderProbe()

    await user.click(screen.getByText('smart'))
    expect(search()).toContain('smart=true')

    await user.click(screen.getByText('clear'))
    expect(search()).toBe('')
    expect(state()).toEqual(DEFAULTS)
  })

  it('keeps earlier choices when a later one is written', async () => {
    const user = userEvent.setup()
    renderProbe()

    await user.click(screen.getByText('smart'))
    await user.click(screen.getByText('price'))

    expect(state()).toMatchObject({ smart: true, priceMin: '10' })
  })

  // Two values in ONE call, because two calls each read the same snapshot and the second dropped the
  // first — that is how picking a category used to lose the category itself.
  it('applies two values written together', async () => {
    const user = userEvent.setup()
    renderProbe('/items?subCategory=hat')

    await user.click(screen.getByText('category'))

    expect(state()).toMatchObject({ category: 'emote', subCategory: null })
    expect(search()).toContain('category=emote')
    expect(search()).not.toContain('subCategory')
  })

  it('leaves unrelated params alone', async () => {
    const user = userEvent.setup()
    renderProbe('/items?q=chapeau')

    await user.click(screen.getByText('smart'))

    expect(search()).toContain('q=chapeau')
  })
})
