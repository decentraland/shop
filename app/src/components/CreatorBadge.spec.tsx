import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useProfile is the only external dependency — mock it so we drive the avatar/name states directly.
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))

// eslint-disable-next-line import/first
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
    const img = container.querySelector('img.creator__ava')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://face.png')
    expect(container.querySelector('.creator__ava--letter')).toBeNull()
    expect(screen.getByText('By bondi')).toBeTruthy()
  })

  it('should fall back to a lettered avatar (name initial) when there is no face snapshot', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi', avatar: { snapshots: {} } } })
    const { container } = renderBadge()
    expect(container.querySelector('img.creator__ava')).toBeNull()
    expect(container.querySelector('.creator__ava--letter')?.textContent).toBe('B')
  })

  it('should fall back to the lettered avatar when the face image fails to load (404 / not deployed)', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi', avatar: { snapshots: { face256: 'https://dead.png' } } } })
    const { container } = renderBadge()
    const img = container.querySelector('img.creator__ava') as HTMLImageElement
    expect(img).not.toBeNull()
    fireEvent.error(img)
    expect(container.querySelector('img.creator__ava')).toBeNull()
    expect(container.querySelector('.creator__ava--letter')?.textContent).toBe('B')
  })

  it('should use the first address character when the profile has no name, and show a short address', () => {
    useProfile.mockReturnValue({ data: undefined })
    const { container } = renderBadge()
    expect(container.querySelector('.creator__ava--letter')?.textContent).toBe('A') // 0x[a]bc… → A
    expect(screen.getByText('By 0xabc0…0001')).toBeTruthy()
  })

  it('should render a clickable button to the creator page when linkToProfile is set', () => {
    useProfile.mockReturnValue({ data: { name: 'bondi' } })
    renderBadge({ linkToProfile: true })
    // The button's accessible name comes from its visible "By bondi" text; no native title tooltip
    // (it leaked into the card hover state — see CreatorBadge).
    const button = screen.getByRole('button', { name: /By bondi/ })
    expect(button.getAttribute('title')).toBeNull()
  })

  it('should render nothing without an address', () => {
    useProfile.mockReturnValue({ data: undefined })
    const { container } = render(
      <MemoryRouter>
        <CreatorBadge />
      </MemoryRouter>
    )
    expect(container.querySelector('.creator')).toBeNull()
  })
})
