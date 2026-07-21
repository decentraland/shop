import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MakeOfferButton } from './MakeOfferButton'
import type { CatalogItem } from '~/lib/api'

const track = vi.hoisted(() => vi.fn())
vi.mock('~/lib/analytics', async orig => ({ ...(await orig<object>()), track }))

const item = { contractAddress: '0xabc', itemId: '7', chainId: 137 } as unknown as CatalogItem

describe('MakeOfferButton', () => {
  beforeEach(() => track.mockReset())

  it('renders as present-but-disabled (aria-disabled, not a hard disable so it stays hoverable)', () => {
    render(<MakeOfferButton item={item} />)
    const btn = screen.getByTestId('make-offer')
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).not.toBeDisabled()
  })

  it('tracks the coming-soon tooltip once per mount on hover', () => {
    render(<MakeOfferButton item={item} />)
    const wrap = screen.getByTestId('make-offer').parentElement as HTMLElement
    fireEvent.mouseEnter(wrap)
    fireEvent.mouseLeave(wrap)
    fireEvent.mouseEnter(wrap)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('Shop Make Offer Tooltip Shown', {
      contractAddress: '0xabc',
      itemId: '7'
    })
  })
})
