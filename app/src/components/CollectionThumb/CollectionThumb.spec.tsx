import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionMosaic } from './CollectionThumb'
import { rarityMedia } from '~/lib/rarity'
import type { CatalogItem } from '~/lib/api'

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'i1',
    name: 'Hat',
    creator: '0xcreator',
    contractAddress: '0xcollection',
    itemId: '1',
    category: 'wearable',
    rarity: 'legendary',
    network: 'MATIC',
    chainId: 137,
    thumbnail: 'https://example.com/hat.png',
    priceCredits: 10,
    gender: null,
    isSmart: false,
    ...overrides
  }
}

const cells = () => screen.getAllByTestId('coll-thumb-cell')

describe('when rendering a collection mosaic', () => {
  it('should wash every cell in its own item rarity, the same treatment the item card gives its media', () => {
    render(<CollectionMosaic items={[item({ id: 'a', rarity: 'legendary' })]} />)
    expect(cells()[0].style.backgroundImage).toBe(rarityMedia('legendary'))
  })

  it('should colour the cells independently, so a mixed collection reads as the items inside it', () => {
    render(<CollectionMosaic items={[item({ id: 'a', rarity: 'legendary' }), item({ id: 'b', rarity: 'common' })]} />)
    const [first, second] = cells()
    expect(first.style.backgroundImage).not.toBe(second.style.backgroundImage)
  })

  it('should still wash a cell whose item has no thumbnail, which is all that cell has to show', () => {
    render(<CollectionMosaic items={[item({ thumbnail: '' })]} />)
    expect(cells()[0].style.backgroundImage).not.toBe('')
    expect(cells()[0].querySelector('img')).toBeNull()
  })

  it('should render at most four cells and report the count, so the grid can reshape to it', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(id => item({ id }))
    const { container } = render(<CollectionMosaic items={many} />)
    expect(cells()).toHaveLength(4)
    expect(container.querySelector('[data-count]')?.getAttribute('data-count')).toBe('4')
  })
})
