import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useRunningCampaign } = vi.hoisted(() => ({ useRunningCampaign: vi.fn() }))
vi.mock('~/hooks/useRunningCampaign', () => ({ useRunningCampaign }))

import { useCampaignBadge } from './useCampaignBadge'

const IN = '0xabc0000000000000000000000000000000000001'
const OUT = '0xdef0000000000000000000000000000000000002'

const badgeFor = (address?: string | null, itemId?: string | null) =>
  renderHook(() => useCampaignBadge(address, itemId)).result.current

beforeEach(() => {
  vi.clearAllMocks()
  useRunningCampaign.mockReturnValue({ label: 'Halloween', contracts: [IN], items: [`${OUT}-3`] })
})

describe('useCampaignBadge', () => {
  it('should label an item whose collection is in the event', () => {
    expect(badgeFor(IN)).toBe('Halloween')
  })

  it('should label it whatever casing the address arrives in', () => {
    // Feeds spell addresses both ways; the campaign's own list is already lowercased.
    expect(badgeFor(IN.toUpperCase().replace('0X', '0x'))).toBe('Halloween')
  })

  it('should say nothing about an item outside the event', () => {
    expect(badgeFor(OUT)).toBeNull()
  })

  it('should label an item the event names on its own, outside any of its collections', () => {
    expect(badgeFor(OUT.toUpperCase().replace('0X', '0x'), '3')).toBe('Halloween')
  })

  it('should not label that item’s siblings, which the event does not name', () => {
    expect(badgeFor(OUT, '4')).toBeNull()
  })

  it('should say nothing while no event is running', () => {
    useRunningCampaign.mockReturnValue(null)

    expect(badgeFor(IN)).toBeNull()
  })

  it('should say nothing before the item’s collection is known', () => {
    // The page reads the address off the route, so it is there from the first paint — but a caller
    // without one must not get a badge.
    expect(badgeFor(undefined)).toBeNull()
  })
})
