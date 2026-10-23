import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CategoryFlap } from './CategoryFlap'

describe('CategoryFlap', () => {
  it('paints the flap in the rarity colour and carries the category glyph', () => {
    const { getByTestId } = render(
      <CategoryFlap item={{ category: 'wearable', wearableCategory: 'upper_body', rarity: 'epic' }} />
    )
    expect(getByTestId('category-flap').style.color).toBe('rgb(40, 156, 255)')
    expect(getByTestId('category-flap-icon')).toBeTruthy()
  })

  it('leaves the glyph out when the category has no icon', () => {
    const { queryByTestId } = render(<CategoryFlap item={{ category: 'wearable', rarity: 'rare' }} />)
    expect(queryByTestId('category-flap-icon')).toBeNull()
  })

  it('pins the compact size when asked', () => {
    const { getByTestId } = render(
      <CategoryFlap item={{ category: 'emote', rarity: 'common' }} size="sm" testId="cart-flap" />
    )
    expect(getByTestId('cart-flap').getAttribute('data-size')).toBe('sm')
  })
})
