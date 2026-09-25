import type { ReactNode } from 'react'
import { Chevron } from '~/components/Chevron'
import { t } from '~/intl/i18n'
import type { SortDir } from '~/lib/tableSort'
import * as S from './SortHeader.styles'

/** A column label that sorts its table. The arrow is always drawn, faintly when idle, so touch screens can find it. */
export function SortHeader({
  label,
  dir,
  onSort,
  align = 'left',
  testId
}: {
  label: ReactNode
  /** The direction in force when this column is the sorted one; undefined otherwise. */
  dir?: SortDir
  onSort: () => void
  align?: 'left' | 'right'
  testId?: string
}) {
  return (
    <S.Root
      type="button"
      onClick={onSort}
      data-dir={dir}
      data-align={align}
      data-testid={testId}
      aria-label={
        typeof label === 'string'
          ? t(dir === 'asc' ? 'common.sortedAsc' : dir === 'desc' ? 'common.sortedDesc' : 'common.sortColumn', {
              column: label
            })
          : undefined
      }
    >
      {label}
      <Chevron up={dir === 'asc'} size={12} aria-hidden data-testid="sort-header-chevron" />
    </S.Root>
  )
}
