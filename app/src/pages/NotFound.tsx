import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { t } from '~/intl/i18n'

// Catch-all for unmatched routes (and malformed deep links like /item/<contract> with no id). Keeps
// a bad URL from rendering a blank page — always offers a way back into the shop.
export function NotFound() {
  return (
    <div className="notfound" data-testid="notfound">
      <span className="ico ico-cart notfound__ico" aria-hidden />
      <h1 className="notfound__title">{t('notFound.title')}</h1>
      <p className="muted">{t('notFound.body')}</p>
      <Button as={Link} to="/assets" variant="purple">
        {t('notFound.cta')}
      </Button>
    </div>
  )
}

export default NotFound
