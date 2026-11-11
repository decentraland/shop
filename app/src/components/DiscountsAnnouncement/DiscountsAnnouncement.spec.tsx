import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { SaleItem, SaleableCollection } from '~/lib/saleableCollections'
import { DiscountsAnnouncement } from './DiscountsAnnouncement'

const item = (key: string, priceCredits: number | null, state: SaleItem['state'] = 'discounted'): SaleItem => ({
  key,
  name: `Item ${key}`,
  thumbnail: '',
  priceCredits,
  state,
  remainingSupply: 10
})

const collection: SaleableCollection = {
  contractAddress: '0xaa',
  name: 'Neon Runners',
  listedCount: 5,
  examplePriceCredits: 40,
  items: [item('a', 20), item('b', 40), item('c', null, 'classic'), item('d', 25), item('e', 30)]
}

function open() {
  const onClose = vi.fn()
  const onCreate = vi.fn()
  render(<DiscountsAnnouncement collection={collection} onClose={onClose} onCreate={onCreate} />)
  return { onClose, onCreate }
}

describe('when a creator is shown the discounts announcement', () => {
  it('should report itself shown once it is on screen', () => {
    const onShown = vi.fn()
    render(<DiscountsAnnouncement collection={collection} onShown={onShown} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(onShown).toHaveBeenCalledOnce()
  })

  it('should name their collection', () => {
    open()
    expect(screen.getByTestId('discounts-announcement').textContent).toContain('Neon Runners')
  })

  it('should show its three priciest Credits items at the example discount', () => {
    open()
    const cards = screen.getAllByTestId('discounts-announcement-item').map(card => card.textContent)
    expect(cards).toHaveLength(3)
    expect(cards[0]).toContain('Item b')
    expect(cards[0]).toContain('28')
    expect(cards.join(' ')).not.toContain('Item c')
  })

  it('should create a discount from its call to action', () => {
    const { onCreate } = open()
    fireEvent.click(screen.getByTestId('discounts-announcement-create'))
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('should close from later, the close button, the backdrop and Escape', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByTestId('discounts-announcement-later'))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('presentation'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(4)
  })

  it('should keep Tab inside the dialog', () => {
    open()
    const close = screen.getByRole('button', { name: /close/i })
    const create = screen.getByTestId('discounts-announcement-create')
    create.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(create)
  })

  it('should give focus back to where it was when it goes away', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const { unmount } = render(<DiscountsAnnouncement collection={collection} onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(document.activeElement).not.toBe(trigger)
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('should not close when the card itself is clicked', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByTestId('discounts-announcement'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
