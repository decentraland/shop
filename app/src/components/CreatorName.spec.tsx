import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// useProfile is the only dependency — mock it so we drive the resolved-name / fallback states directly.
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))

import { CreatorName } from './CreatorName'

const ADDR = '0x4274c2f7cf0b5ab7f9d3d2a9e3f4f5a6b7c8d9e0'

beforeEach(() => {
  useProfile.mockReset()
})

describe('CreatorName', () => {
  it('should show the resolved profile display name (capitalised) when the creator has one', () => {
    useProfile.mockReturnValue({ data: { name: 'ro' } })
    const { container } = render(<CreatorName address={ADDR} />)
    expect(container.textContent).toBe('By Ro')
  })

  it('should fall back to a truncated address when the profile has no name', () => {
    useProfile.mockReturnValue({ data: undefined })
    const { container } = render(<CreatorName address={ADDR} />)
    // Never the raw 42-char wallet address — a short 0x…last4 instead.
    expect(container.textContent).toBe('By 0x4274…d9e0')
    expect(container.textContent).not.toContain(ADDR)
  })

  it('should forward the className to the rendered row', () => {
    useProfile.mockReturnValue({ data: { name: 'ro' } })
    const { container } = render(<CreatorName address={ADDR} className="buy-modal__asset-creator" />)
    expect(container.querySelector('.buy-modal__asset-creator')).not.toBeNull()
  })
})
