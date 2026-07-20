import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '~/lib/auth'
import { importListing, RelistFailedError, type ImportItem } from '~/lib/import'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { track } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'

export type MigrateEntry = { item: ImportItem; priceCredits: number }
// 'unlisted' = the old listing was taken down but re-listing failed → the item now has NO listing and
// must be re-listed from My Assets (distinct from 'skipped', which leaves the old listing intact).
type Status = 'pending' | 'active' | 'done' | 'skipped' | 'failed' | 'unlisted'

// Lists a queue of old items into the Shop one at a time (each needs one confirmation). Shows live
// progress, then a congrats. Closing refreshes the pages behind it (via onDone).
export function MigrateModal({
  queue,
  session,
  onClose,
  onDone
}: {
  queue: MigrateEntry[]
  session: Session
  onClose: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const showsConfirmations = showsWalletConfirmations(session.providerType)
  const [statuses, setStatuses] = useState<Status[]>(() => queue.map(() => 'pending'))
  const [phase, setPhase] = useState<'running' | 'finished'>('running')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false
    const migrateItems = async () => {
      for (let i = 0; i < queue.length; i++) {
        if (cancelled) return
        setStatuses(s => s.map((v, idx) => (idx === i ? 'active' : v)))
        try {
          await importListing(queue[i].item, queue[i].priceCredits, session)
          track('Shop Migrated Listing', {
            item_id: queue[i].item.itemId ?? queue[i].item.oldTradeId ?? null,
            contract_address: queue[i].item.contractAddress,
            new_price_credits: queue[i].priceCredits,
            new_price_usd: queue[i].priceCredits / 10
          })
          if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? 'done' : v)))
        } catch (e) {
          if (e instanceof RelistFailedError) {
            // Old listing already removed but re-listing failed → the item is now unlisted (not a plain
            // skip). Always capture it; the summary points the seller to re-list from My Assets.
            captureError(e, {
              flow: 'import_listing',
              step: 'relist',
              itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId
            })
            if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? 'unlisted' : v)))
          } else {
            const err = e as { code?: number; message?: string }
            const rejected = err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? '')
            if (!rejected)
              captureError(e, { flow: 'import_listing', itemId: queue[i].item.itemId ?? queue[i].item.oldTradeId })
            if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? (rejected ? 'skipped' : 'failed') : v)))
          }
        }
      }
      if (!cancelled) setPhase('finished')
    }

    void migrateItems()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listedCount = statuses.filter(s => s === 'done').length
  const activeIndex = statuses.findIndex(s => s === 'active')
  const progress = Math.round((statuses.filter(s => s !== 'pending' && s !== 'active').length / queue.length) * 100)

  function finish() {
    onDone()
    onClose()
  }

  if (phase === 'finished') {
    const skipped = statuses.filter(s => s === 'skipped' || s === 'failed').length
    const unlisted = statuses.filter(s => s === 'unlisted').length
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal modal--success" role="dialog" aria-modal="true">
          <div className="modal-success__check" aria-hidden>
            ✓
          </div>
          <h2 className="modal__title">
            {listedCount > 0 ? t('migrate.successTitle') : t('migrate.nothingTitle')}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {listedCount > 0
              ? t('migrate.listedSummary', { count: listedCount, currency: CURRENCY.name })
              : t('migrate.noneListed')}
            {skipped > 0 ? ' ' + t('migrate.skippedSummary', { count: skipped }) : ''}
            {unlisted > 0 ? ' ' + t('migrate.unlistedSummary', { count: unlisted }) : ''}
          </p>
          <div className="modal__actions">
            <button className="btn btn--ghost" onClick={finish}>
              {t('getCredits.done')}
            </button>
            {unlisted > 0 ? (
              <button
                className="btn btn--purple"
                onClick={() => {
                  onDone()
                  onClose()
                  navigate('/my-assets')
                }}
              >
                {t('migrate.goToMyAssets')}
              </button>
            ) : listedCount > 0 ? (
              <button
                className="btn btn--purple"
                onClick={() => {
                  onDone()
                  onClose()
                  navigate('/assets')
                }}
              >
                {t('migrate.viewInShop')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal migrate" role="dialog" aria-modal="true" aria-live="polite">
        <h2 className="modal__title">{t('migrate.listingTitle')}</h2>
        <p className="muted small" style={{ margin: '0 0 4px' }}>
          {showsConfirmations ? t('migrate.subConfirm') : t('migrate.subManaged')}{' '}
          {activeIndex >= 0 ? t('migrate.progressCount', { current: activeIndex + 1, total: queue.length }) : ''}
        </p>

        <div className="migrate__progress">
          <div className="migrate__bar" style={{ width: `${progress}%` }} />
        </div>

        <ul className="migrate__list">
          {queue.map((entry, i) => (
            <li className={`migrate__row migrate__row--${statuses[i]}`} key={entry.item.oldTradeId}>
              <span className="migrate__thumb">
                {entry.item.thumbnail ? <img src={entry.item.thumbnail} alt="" /> : null}
              </span>
              <span className="migrate__name" title={entry.item.name}>
                {entry.item.name || t('migrate.itemFallback')}
              </span>
              <span className="migrate__price">
                <CurrencyIcon className="ccy-mark" /> {entry.priceCredits.toLocaleString()}
              </span>
              <span className="migrate__status">
                {statuses[i] === 'active' ? (
                  <>
                    <span className="spinner migrate__spin" aria-hidden />{' '}
                    {showsConfirmations ? t('migrate.statusConfirm') : t('migrate.statusAdding')}
                  </>
                ) : statuses[i] === 'done' ? (
                  <span className="migrate__tick">✓</span>
                ) : statuses[i] === 'skipped' ? (
                  <span className="migrate__skip">{t('migrate.statusSkipped')}</span>
                ) : statuses[i] === 'failed' ? (
                  <span className="migrate__skip">{t('migrate.statusFailed')}</span>
                ) : statuses[i] === 'unlisted' ? (
                  <span className="migrate__skip" title={t('migrate.unlistedTooltip')}>
                    {t('migrate.statusUnlisted')}
                  </span>
                ) : (
                  <span className="migrate__wait">{t('migrate.statusWaiting')}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="muted small migrate__hint">
          {showsConfirmations ? t('migrate.hintConfirm') : t('migrate.hintManaged')}
        </p>
      </div>
    </div>
  )
}
