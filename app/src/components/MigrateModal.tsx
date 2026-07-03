import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '~/lib/auth'
import { importListing, type ImportItem } from '~/lib/import'

export type MigrateEntry = { item: ImportItem; priceCredits: number }
type Status = 'pending' | 'active' | 'done' | 'skipped' | 'failed'

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
  const [statuses, setStatuses] = useState<Status[]>(() => queue.map(() => 'pending'))
  const [phase, setPhase] = useState<'running' | 'finished'>('running')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false
    ;(async () => {
      for (let i = 0; i < queue.length; i++) {
        if (cancelled) return
        setStatuses(s => s.map((v, idx) => (idx === i ? 'active' : v)))
        try {
          await importListing(queue[i].item, queue[i].priceCredits, session)
          if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? 'done' : v)))
        } catch (e) {
          const err = e as { code?: number; message?: string }
          const rejected = err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? '')
          if (!cancelled) setStatuses(s => s.map((v, idx) => (idx === i ? (rejected ? 'skipped' : 'failed') : v)))
        }
      }
      if (!cancelled) setPhase('finished')
    })()

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
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal modal--success" role="dialog" aria-modal="true">
          <div className="modal-success__check" aria-hidden>✓</div>
          <h2 className="modal__title">{listedCount > 0 ? "You're in the Shop! 🎉" : 'Nothing listed'}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {listedCount > 0
              ? `${listedCount} ${listedCount === 1 ? 'item is' : 'items are'} now for sale with credits.`
              : 'No items were listed.'}
            {skipped > 0 ? ` ${skipped} skipped — you can try those again anytime.` : ''}
          </p>
          <div className="modal__actions">
            <button className="btn btn--ghost" onClick={finish}>Done</button>
            {listedCount > 0 ? (
              <button
                className="btn btn--purple"
                onClick={() => {
                  onDone()
                  onClose()
                  navigate('/assets')
                }}
              >
                View in Shop
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
        <h2 className="modal__title">Listing your items</h2>
        <p className="muted small" style={{ margin: '0 0 4px' }}>
          Confirm each item to add it to the Shop. {activeIndex >= 0 ? `${activeIndex + 1} of ${queue.length}` : ''}
        </p>

        <div className="migrate__progress"><div className="migrate__bar" style={{ width: `${progress}%` }} /></div>

        <ul className="migrate__list">
          {queue.map((entry, i) => (
            <li className={`migrate__row migrate__row--${statuses[i]}`} key={entry.item.oldTradeId}>
              <span className="migrate__thumb">
                {entry.item.thumbnail ? <img src={entry.item.thumbnail} alt="" /> : null}
              </span>
              <span className="migrate__name" title={entry.item.name}>{entry.item.name || 'Item'}</span>
              <span className="migrate__price">◈ {entry.priceCredits.toLocaleString()}</span>
              <span className="migrate__status">
                {statuses[i] === 'active' ? (
                  <><span className="spinner migrate__spin" aria-hidden /> Confirm…</>
                ) : statuses[i] === 'done' ? (
                  <span className="migrate__tick">✓</span>
                ) : statuses[i] === 'skipped' ? (
                  <span className="migrate__skip">Skipped</span>
                ) : statuses[i] === 'failed' ? (
                  <span className="migrate__skip">Failed</span>
                ) : (
                  <span className="migrate__wait">Waiting</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="muted small migrate__hint">A quick confirmation pops up for each item. Keep this open.</p>
      </div>
    </div>
  )
}
