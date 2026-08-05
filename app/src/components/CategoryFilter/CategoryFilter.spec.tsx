import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryFilter } from '~/components/CategoryFilter'
import { SUBCAT_MAP } from '~/lib/categories'

// `t()` falls back to English without a provider, so the rendered labels are the en.json strings.
function renderFilter(props: Partial<Parameters<typeof CategoryFilter>[0]> = {}) {
  const onCategory = vi.fn()
  const onSub = vi.fn()
  render(<CategoryFilter category="wearable" subCategory={null} onCategory={onCategory} onSub={onSub} {...props} />)
  return { onCategory, onSub }
}

// Anchored: an unanchored /head/i also matches "Top Head".
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') })

/**
 * Whether a row's own children are expanded. The accordion collapses with `grid-template-rows: 0fr`
 * rather than unmounting, so the children stay in the DOM either way and presence proves nothing — the
 * `data-open` flag on that row's OWN container is the real signal. Scoped with a downward query, because
 * `closest()` would climb past it to the Wearables accordion, which is open the whole time.
 */
const isExpanded = (name: string) => !!row(name).parentElement?.querySelector('[data-open]')

describe('the wearables category filter', () => {
  it('should show the second-level categories with Wearables open', () => {
    renderFilter()

    expect(row('Head')).toBeInTheDocument()
    expect(row('Accessories')).toBeInTheDocument()
    expect(row('Skins')).toBeInTheDocument()
  })

  /**
   * The expand chevron used to be tinted with the near-black `text` colour, which disappeared against the
   * dark panel. The fix is not simply a different value: a `color` prop lands as an INLINE style, and an
   * inline style cannot be overridden by the :hover rule that takes the chevron to white — so the tint has
   * to come from the stylesheet. That mechanism is what this pins; the two colours themselves are CSS, and
   * jsdom resolves no cascade to assert them against.
   */
  /**
   * Exactly one row is the selection. `category` stays on wearables while a sub-category is picked, so
   * without the guard the parent kept its highlight and sat lit underneath its own lit child.
   */
  describe('where the highlight sits', () => {
    it('should hand it to the sub-category instead of lighting the parent too', () => {
      renderFilter({ category: 'wearable', subCategory: 'Head' })

      expect(row('Wearables')).not.toHaveAttribute('data-selected')
      expect(row('Head')).toHaveAttribute('data-active')
    })

    it('should keep it on the parent while the parent IS the selection', () => {
      renderFilter({ category: 'wearable', subCategory: null })

      expect(row('Wearables')).toHaveAttribute('data-selected')
    })
  })

  it('should leave the expand chevron for the stylesheet to tint rather than an inline colour', () => {
    renderFilter()

    const chevron = row('Head').querySelector('[data-chevron]')

    expect(chevron).toBeTruthy()
    // `size` still sets width/height inline — it is specifically a colour that must not be pinned here.
    expect(chevron?.getAttribute('style') ?? '').not.toMatch(/color/)
  })

  /**
   * Head and Accessories are the only two that nest (Figma 2212:99919). They stay selectable as well as
   * expandable — collapsing them into non-clickable folders would remove the "everything on the head"
   * filter that exists today.
   */
  describe('when a nesting category is clicked', () => {
    it('should select it AND reveal its sub-categories', async () => {
      const user = userEvent.setup()
      const { onSub } = renderFilter()

      expect(isExpanded('Head')).toBe(false)

      await user.click(row('Head'))

      expect(onSub).toHaveBeenCalledWith('Head')
      expect(isExpanded('Head')).toBe(true)
      expect(row('Facial Hair')).toBeInTheDocument()
      expect(row('Eyebrows')).toBeInTheDocument()
    })

    it('should let a third-level category be picked on its own', async () => {
      const user = userEvent.setup()
      const { onSub } = renderFilter()

      await user.click(row('Accessories'))
      await user.click(row('Helmet'))

      // A third level needs no extra filter state: the key goes through the same onSub as level two.
      expect(onSub).toHaveBeenLastCalledWith('Helmet')
    })

    it('should collapse it again on a second click', async () => {
      const user = userEvent.setup()
      renderFilter()

      await user.click(row('Head'))
      expect(isExpanded('Head')).toBe(true)

      await user.click(row('Head'))

      expect(isExpanded('Head')).toBe(false)
    })
  })

  describe('and a category that does not nest is clicked', () => {
    it('should not reveal a third level', async () => {
      const user = userEvent.setup()
      renderFilter()

      await user.click(row('Feet'))

      // Feet has no children, so nothing expands — and Head stays shut rather than being dragged open.
      expect(isExpanded('Feet')).toBe(false)
      expect(isExpanded('Head')).toBe(false)
    })
  })
})

/**
 * The sidebar is only useful if every key it can emit resolves to a server filter, and if the parents
 * mean the union of their children — otherwise picking Head would return less than the rows beneath it.
 */
describe('the sub-category to on-chain category mapping', () => {
  it('should map every third-level key', () => {
    const thirdLevel = [
      'Facial Hair',
      'Hair',
      'Eyes',
      'Eyebrows',
      'Mouth',
      'Earring',
      'Eyewear',
      'Hat',
      'Helmet',
      'Mask',
      'Tiara',
      'Top Head'
    ]

    expect(thirdLevel.filter(k => !SUBCAT_MAP[k])).toEqual([])
  })

  it('should make each parent the union of its children', () => {
    const head = ['Facial Hair', 'Hair', 'Eyes', 'Eyebrows', 'Mouth'].flatMap(k => SUBCAT_MAP[k])
    const accessories = ['Earring', 'Eyewear', 'Hat', 'Helmet', 'Mask', 'Tiara', 'Top Head'].flatMap(k => SUBCAT_MAP[k])

    expect(SUBCAT_MAP.Head).toEqual(expect.arrayContaining(head))
    expect(SUBCAT_MAP.Accessories).toEqual(expect.arrayContaining(accessories))
  })

  it('should group the head-worn accessories under Accessories, not Head', () => {
    // This is the behaviour change: these used to sit under Head, which put them in a different section
    // from where the marketplace and the design place them.
    for (const worn of ['hat', 'helmet', 'mask', 'tiara', 'top_head']) {
      expect(SUBCAT_MAP.Accessories).toContain(worn)
      expect(SUBCAT_MAP.Head).not.toContain(worn)
    }
  })
})
