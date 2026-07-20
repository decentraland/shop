import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useProfile is the only external dependency — mock it so we drive the avatar/name states directly.
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))

import { CreatorBadge } from './CreatorBadge'

const ADDR = '0xabc0000000000000000000000000000000000001'

function renderBadge(props: { linkToProfile?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <CreatorBadge address={ADDR} {...props} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  useProfile.mockReset()
})

describe('CreatorBadge avatar rendering', () => {
  it('should render the profile face image when a face snapshot exists', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi', avatar: { snapshots: { face256: 'https://face.png' } } } })
    const { container } = renderBadge()
    const img = container.querySelector('[data-testid="creator-ava"]')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://face.png')
    expect(container.querySelector('[data-testid="creator-ava-letter"]')).toBeNull()
    // The name is split across "By " + a <span class="creator__display">, so match the row's full text.
    // The display capitalises the first letter of the profile name ("bondi" → "Bondi").
    expect(container.querySelector('[data-testid="creator-name"]')?.textContent).toBe('By Bondi')
  })

  it('should fall back to a lettered avatar (name initial) when there is no face snapshot', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi', avatar: { snapshots: {} } } })
    const { container } = renderBadge()
    expect(container.querySelector('[data-testid="creator-ava"]')).toBeNull()
    expect(container.querySelector('[data-testid="creator-ava-letter"]')?.textContent).toBe('B')
  })

  it('should fall back to the lettered avatar when the face image fails to load (404 / not deployed)', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi', avatar: { snapshots: { face256: 'https://dead.png' } } } })
    const { container } = renderBadge()
    const img = container.querySelector('[data-testid="creator-ava"]') as HTMLImageElement
    expect(img).not.toBeNull()
    fireEvent.error(img)
    expect(container.querySelector('[data-testid="creator-ava"]')).toBeNull()
    expect(container.querySelector('[data-testid="creator-ava-letter"]')?.textContent).toBe('B')
  })

  it('should use the first address character when the profile has no name, and show a short address', () => {
    useProfile.mockReturnValue({ data: undefined })
    const { container } = renderBadge()
    expect(container.querySelector('[data-testid="creator-ava-letter"]')?.textContent).toBe('A') // 0x[a]bc… → A
    expect(container.querySelector('[data-testid="creator-name"]')?.textContent).toBe('By 0xabc0…0001')
  })

  it('should render a clickable button to the creator page when linkToProfile is set', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi' } })
    renderBadge({ linkToProfile: true })
    // The button's accessible name comes from its visible "By Bondi" text (first letter capitalised);
    // no native title tooltip (it leaked into the card hover state — see CreatorBadge).
    const button = screen.getByRole('button', { name: /By Bondi/ })
    expect(button.getAttribute('title')).toBeNull()
  })

  it('should render nothing without an address', () => {
    useProfile.mockReturnValue({ data: undefined })
    const { container } = render(
      <MemoryRouter>
        <CreatorBadge />
      </MemoryRouter>
    )
    expect(container.querySelector('[data-testid="creator"]')).toBeNull()
  })
})
