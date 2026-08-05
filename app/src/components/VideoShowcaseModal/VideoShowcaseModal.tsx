import { useEffect, useRef } from 'react'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import * as S from './VideoShowcaseModal.styles'

/**
 * The creator's showcase clip for a smart wearable — what it looks like in world, which a still 3D preview
 * of the garment cannot show. Opened from the play button over the item preview; the marketplace has the
 * same dialog behind the same affordance.
 *
 * Muted + autoplay on purpose: an unmuted autoplay is blocked by every browser, so the clip would open
 * paused and look broken. Controls are on, so sound is one click away.
 */
export function VideoShowcaseModal({
  src,
  itemName,
  onClose
}: {
  src: string
  itemName?: string
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <S.Scrim onClick={onClose} role="presentation">
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        // The click that plays/pauses the clip must not also dismiss the dialog behind it.
        onClick={e => e.stopPropagation()}
        data-testid="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('itemDetail.showcaseTitle')}
      >
        <S.Head>
          <S.Title>{itemName || t('itemDetail.showcaseTitle')}</S.Title>
          <S.Close onClick={onClose} aria-label={t('itemDetail.showcaseClose')}>
            <Icon name="close" size={18} />
          </S.Close>
        </S.Head>
        <S.Video src={src} data-testid="showcase-video" controls autoPlay muted playsInline preload="auto" />
      </S.Card>
    </S.Scrim>
  )
}
