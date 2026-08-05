import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Faq } from './Faq'

// Real keys from the locale files, so the test also proves the copy resolves — a missing key would render
// the key string itself and every assertion below would still pass against it if they used placeholders.
const ENTRIES = [
  { question: 'faq.buyers.expireQ', answer: 'faq.buyers.expireA' },
  { question: 'faq.buyers.transferQ', answer: 'faq.buyers.transferA' }
]

function renderFaq() {
  return render(<Faq title="faq.title" entries={ENTRIES} />)
}

describe('the FAQ accordion', () => {
  it('shows every question and no answer until one is opened', () => {
    renderFaq()

    expect(screen.getByText('Do Credits expire?')).toBeTruthy()
    expect(screen.getByText('Can Credits be transferred or exchanged for cash?')).toBeTruthy()
    // Not merely hidden: a collapsed answer left in the DOM is still found by in-page search and read by a
    // screen reader walking the page, which turns a closed FAQ into a wall of text.
    expect(screen.queryAllByTestId('faq-answer')).toHaveLength(0)
  })

  it('resolves the copy from the locale file rather than rendering the key', () => {
    renderFaq()

    expect(screen.getByText('Learn More About Credits')).toBeTruthy()
    expect(screen.queryByText(/^faq\./)).toBeNull()
  })

  it('opens an answer on click and closes it on a second click', async () => {
    const user = userEvent.setup()
    renderFaq()
    const question = screen.getByRole('button', { name: 'Do Credits expire?' })

    await user.click(question)
    expect(screen.getByTestId('faq-answer').textContent).toContain('Credits do not expire')
    expect(question.getAttribute('aria-expanded')).toBe('true')

    await user.click(question)
    expect(screen.queryAllByTestId('faq-answer')).toHaveLength(0)
    expect(question.getAttribute('aria-expanded')).toBe('false')
  })

  // Independent, not one-at-a-time: someone comparing two answers must not have the first yanked away.
  it('keeps an open answer open while another is opened', async () => {
    const user = userEvent.setup()
    renderFaq()

    await user.click(screen.getByRole('button', { name: 'Do Credits expire?' }))
    await user.click(screen.getByRole('button', { name: 'Can Credits be transferred or exchanged for cash?' }))

    expect(screen.getAllByTestId('faq-answer')).toHaveLength(2)
  })

  it('is operable from the keyboard, because the toggle is a real button', async () => {
    const user = userEvent.setup()
    renderFaq()

    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Do Credits expire?' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('points each toggle at the panel it controls', async () => {
    const user = userEvent.setup()
    renderFaq()
    const question = screen.getByRole('button', { name: 'Do Credits expire?' })

    await user.click(question)

    expect(question.getAttribute('aria-controls')).toBe(screen.getByTestId('faq-answer').id)
  })

  it('carries the skin on the section so both pages share one component', () => {
    const { rerender } = renderFaq()
    expect(screen.getByTestId('faq').getAttribute('data-tone')).toBe('light')

    rerender(<Faq title="faq.title" entries={ENTRIES} tone="on-dark" />)
    expect(screen.getByTestId('faq').getAttribute('data-tone')).toBe('on-dark')
  })
})
