import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  describe('when rendered', () => {
    it('should default to a medium column layout with a generic accessible name', () => {
      render(<Spinner />)
      const box = screen.getByTestId('spinner-box')
      expect(box.getAttribute('data-direction')).toBe('column')
      expect(box.getAttribute('role')).toBe('status')
      expect(box.getAttribute('aria-label')).toBe('Loading')
      expect(screen.getByTestId('spinner-box-ring').getAttribute('data-size')).toBe('medium')
    })

    it('should render the label and use it as the accessible name (no generic fallback)', () => {
      render(<Spinner label="Loading your store…" />)
      expect(screen.getByText('Loading your store…')).toBeTruthy()
      expect(screen.getByTestId('spinner-box').getAttribute('aria-label')).toBeNull()
    })

    it('should apply the requested size and direction', () => {
      render(<Spinner size="large" direction="row" />)
      expect(screen.getByTestId('spinner-box').getAttribute('data-direction')).toBe('row')
      expect(screen.getByTestId('spinner-box-ring').getAttribute('data-size')).toBe('large')
    })

    it('should append a custom className', () => {
      render(<Spinner className="my-loader" />)
      expect(screen.getByTestId('spinner-box').classList.contains('my-loader')).toBe(true)
    })
  })
})
