import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  describe('when rendered', () => {
    it('should default to a medium column layout with a generic accessible name', () => {
      const { container } = render(<Spinner />)
      const box = container.querySelector('.spinner-box')!
      expect(box.className).toContain('spinner-box--column')
      expect(box.getAttribute('role')).toBe('status')
      expect(box.getAttribute('aria-label')).toBe('Loading')
      expect(container.querySelector('.spinner-box__ring--medium')).toBeTruthy()
    })

    it('should render the label and use it as the accessible name (no generic fallback)', () => {
      const { container } = render(<Spinner label="Loading your store…" />)
      expect(screen.getByText('Loading your store…')).toBeTruthy()
      expect(container.querySelector('.spinner-box')!.getAttribute('aria-label')).toBeNull()
    })

    it('should apply the requested size and direction', () => {
      const { container } = render(<Spinner size="large" direction="row" />)
      expect(container.querySelector('.spinner-box--row')).toBeTruthy()
      expect(container.querySelector('.spinner-box__ring--large')).toBeTruthy()
    })

    it('should append a custom className', () => {
      const { container } = render(<Spinner className="my-loader" />)
      expect(container.querySelector('.spinner-box.my-loader')).toBeTruthy()
    })
  })
})
