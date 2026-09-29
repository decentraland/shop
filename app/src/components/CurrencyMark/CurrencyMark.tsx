import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Tooltip } from '~/components/Tooltip'
import { t } from '~/intl/i18n'
import manaSymbol from '~/assets/mana-matic.svg'
import * as S from './CurrencyMark.styles'

/**
 * The mark before an amount, naming its currency on hover.
 *
 * One component for both rails so a figure reads the same wherever it appears: the credits mark is the
 * Shop's own glyph, the MANA one the Polygon token's. The tooltip exists because the glyph alone does not
 * say WHICH mana — a buyer holding Ethereum MANA cannot spend it here.
 */
export function CurrencyMark({ kind, className }: { kind: 'mana' | 'credits'; className?: string }) {
  const label = kind === 'mana' ? t('currency.polygonMana') : t('currency.credits')
  return (
    <Tooltip content={label}>
      <S.Mark className={className} aria-label={label} role="img" data-kind={kind}>
        {kind === 'mana' ? <img src={manaSymbol} alt="" aria-hidden /> : <CurrencyIcon className="ccy-mark" />}
      </S.Mark>
    </Tooltip>
  )
}

export default CurrencyMark
