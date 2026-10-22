import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropdown, type DropdownOption } from '~/components/Dropdown'

const OPTIONS: DropdownOption[] = [
  { value: 'all', label: 'All collections' },
  { value: 'stable', label: 'Tiger Stable' },
  { value: 'wings', label: 'Tiger Wings' },
  { value: 'horse', label: 'Help I am a Horse' }
]

function Harness({ searchable = true, onChange = () => {} }: { searchable?: boolean; onChange?: (v: string) => void }) {
  const [value, setValue] = useState('all')
  return (
    <Dropdown
      options={OPTIONS}
      value={value}
      onChange={next => {
        onChange(next)
        setValue(next)
      }}
      ariaLabel="Collection"
      searchPlaceholder={searchable ? 'Search collections' : undefined}
    />
  )
}

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Collection' }))
const shownOptions = () => screen.getAllByRole('option').map(option => option.textContent)

describe('when the dropdown has a search field', () => {
  it('should focus the search on opening and narrow the options to what is typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    expect(screen.getByTestId('dropdown-search')).toHaveFocus()

    await user.keyboard('tiger')
    expect(shownOptions()).toEqual(['Tiger Stable', 'Tiger Wings'])
  })

  it('should pick the highlighted option with the arrows and Enter, and close', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await open(user)
    await user.keyboard('tiger{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('wings')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Collection' })).toHaveFocus()
  })

  it('should say so when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.keyboard('zebra')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByTestId('dropdown-empty')).toBeInTheDocument()
  })

  it('should start from the full list each time it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.keyboard('wings{Escape}')
    await open(user)

    expect(screen.getByTestId('dropdown-search')).toHaveValue('')
    expect(shownOptions()).toHaveLength(OPTIONS.length)
  })
})

describe('when the dropdown has no search field', () => {
  it('should show every option and no search', async () => {
    const user = userEvent.setup()
    render(<Harness searchable={false} />)
    await open(user)

    expect(screen.queryByTestId('dropdown-search')).toBeNull()
    expect(shownOptions()).toHaveLength(OPTIONS.length)
  })
})
