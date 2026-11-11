import { categoryIcon } from '~/lib/itemIcons'
import { rarityCardPalette } from '~/lib/rarity'
import type { CatalogItem } from '~/lib/api'
import { theme } from '~/styles/theme'
import * as S from './CategoryFlap.styles'

type Props = {
  item: Pick<CatalogItem, 'category' | 'wearableCategory' | 'rarity'>
  /** `sm` pins the compact flap at every width; the default shrinks to it only on narrow screens. */
  size?: 'md' | 'sm'
  testId?: string
}

/** The rarity-coloured corner flap carrying the item's category glyph, over an artwork tile. */
export function CategoryFlap({ item, size = 'md', testId = 'category-flap' }: Props) {
  const icon = categoryIcon(item)
  return (
    <S.Root data-testid={testId} data-size={size} style={{ color: rarityCardPalette(item.rarity).flap }} aria-hidden>
      <S.Shape viewBox="0 0 74.3396 76.3292" fill="none">
        <path
          d="M74.3396 0C69.5001 0 64.8597 1.97443 61.4442 5.48691L5.30672 63.1687C1.90819 66.6637 0 71.396 0 76.3292V16C0 7.16344 7.15288 0 15.9894 0C34.3475 0 63.3425 0 74.3396 0Z"
          fill="currentColor"
        />
        <path
          d="M0.000174325 61.9577V75.6466C0.0323562 70.7588 1.93729 66.0768 5.30689 62.6115L48.9105 17.7703C48.9697 17.7093 49.0294 17.6488 49.0894 17.5888L0.000174325 61.9577Z"
          fill={theme.colors.text}
          opacity="0.2"
        />
      </S.Shape>
      {icon ? <S.Glyph name={icon} data-testid={`${testId}-icon`} /> : null}
    </S.Root>
  )
}
