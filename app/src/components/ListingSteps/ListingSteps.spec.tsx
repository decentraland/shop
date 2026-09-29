import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ListingSteps } from '~/components/ListingSteps'

describe('ListingSteps', () => {
  describe('when a self-custody seller is taking the current listing down', () => {
    it('should show step 1 of 2 with the confirm-removal copy', () => {
      render(<ListingSteps phase="cancel" managed={false} />)
      expect(screen.getByTestId('listing-steps-count').textContent).toBe('1/2')
      expect(screen.getByText(/confirm the removal/i)).toBeTruthy()
    })
  })

  describe('when a self-custody seller is publishing the new price', () => {
    it('should show step 2 of 2 with the confirm-new-price copy', () => {
      render(<ListingSteps phase="list" managed={false} />)
      expect(screen.getByTestId('listing-steps-count').textContent).toBe('2/2')
      expect(screen.getByText(/confirm your new price/i)).toBeTruthy()
    })
  })

  describe('when a managed seller is publishing the new price', () => {
    it('should show step 2 of 2 without confirm wording', () => {
      render(<ListingSteps phase="list" managed slow />)
      expect(screen.getByTestId('listing-steps-count').textContent).toBe('2/2')
      expect(screen.getByText('Publishing your new price…')).toBeTruthy()
      expect(screen.queryByText(/confirm/i)).toBeNull()
      expect(screen.getByTestId('listing-steps-slow')).toBeTruthy()
    })
  })
})
