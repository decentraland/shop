import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewPricingModal } from './NewPricingModal'

const onClose = vi.fn()
const onConfirm = vi.fn()

function renderModal() {
  return render(<NewPricingModal onClose={onClose} onConfirm={onConfirm} />)
}

beforeEach(() => vi.clearAllMocks())

describe('when the new-pricing prompt is shown', () => {
  it('should render the explainer and both ctas', () => {
    renderModal()

    expect(screen.getByTestId('new-pricing-modal')).toBeInTheDocument()
    expect(screen.getByText('Switch your listings to Credits!')).toBeInTheDocument()
    expect(screen.getByTestId('new-pricing-later')).toBeInTheDocument()
    expect(screen.getByTestId('new-pricing-confirm')).toBeInTheDocument()
  })

  it('should state the peg so the seller knows what a credit is worth', () => {
    renderModal()

    const rate = screen.getByTestId('credit-rate')
    expect(rate).toHaveTextContent('1 Credit')
    expect(rate).toHaveTextContent('$USD 0.10')
  })

  it('should offer the opt-out unchecked', () => {
    renderModal()

    expect(screen.getByTestId('new-pricing-opt-out')).not.toBeChecked()
  })
})

describe('when the prompt is dismissed without opting out', () => {
  it.each([
    ['the close button', 'Close'],
    ['maybe later', 'Maybe later']
  ])('should report no opt-out when closed via %s', async (_label, accessibleName) => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: accessibleName }))

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('should report no opt-out when closed with Escape', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('should report no opt-out when the scrim is clicked', async () => {
    const user = userEvent.setup()
    const { container } = renderModal()

    await user.click(container.firstChild as Element)

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('should NOT close when the card itself is clicked', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('new-pricing-modal'))

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('when the seller ticks "don’t show this again"', () => {
  it('should report the opt-out on close', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('new-pricing-opt-out'))
    await user.click(screen.getByTestId('new-pricing-later'))

    expect(onClose).toHaveBeenCalledWith(true)
  })

  // The choice stands whichever button closed the prompt — otherwise the seller who ticks the box and
  // then goes to the tool would be asked again on their next visit.
  it('should report the opt-out when confirming instead of closing', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('new-pricing-opt-out'))
    await user.click(screen.getByTestId('new-pricing-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should report the opt-out when closed with Escape', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('new-pricing-opt-out'))
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('should let the seller untick it again', async () => {
    const user = userEvent.setup()
    renderModal()

    const box = screen.getByTestId('new-pricing-opt-out')
    await user.click(box)
    await user.click(box)
    await user.click(screen.getByTestId('new-pricing-later'))

    expect(onClose).toHaveBeenCalledWith(false)
  })
})

describe('when the seller accepts the prompt', () => {
  it('should confirm without opting out', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByTestId('new-pricing-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(false)
  })
})
