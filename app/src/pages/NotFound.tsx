import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import * as S from './NotFound.styles'

// Catch-all for unmatched routes (and malformed deep links like /item/<contract> with no id). Keeps
// a bad URL from rendering a blank page — always offers a way back into the shop.
export function NotFound() {
  useSeo({ title: t('seo.notFound.title'), noindex: true })
  return (
    <S.Root data-testid="notfound">
      <S.Ico name="cart" size={44} />
      <S.Title>{t('notFound.title')}</S.Title>
      <S.Body>{t('notFound.body')}</S.Body>
      <Button as={Link} to="/items" variant="white">
        {t('notFound.cta')}
      </Button>
    </S.Root>
  )
}

export default NotFound
