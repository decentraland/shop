import { useState, type CSSProperties } from 'react'
import { CardCarousel } from '~/components/CardCarousel'
import { Icon } from '~/components/Icon'
import { useCart } from '~/store/cart'
import { fetchCatalogByIds } from '~/lib/api'
import { itemIdFromUrn } from '~/lib/urn'
import { t } from '~/intl/i18n'
import { AVATARS, type Avatar } from './avatars'
import * as S from './AvatarShowcase.styles'

// The avatar looks are curated from MAINNET (matic) wearables, so they're resolved against the mainnet
// marketplace regardless of which environment the Shop runs in — otherwise dev/stg (pointed at .zone)
// would never find them.
const MAINNET_MARKETPLACE = 'https://marketplace-api.decentraland.org'

type AddState = 'idle' | 'loading' | 'done'

function AvatarCard({ avatar }: { avatar: Avatar }) {
  const add = useCart(s => s.add)
  const [state, setState] = useState<AddState>('idle')

  // Resolve the look's URNs to catalog items and drop every buyable one (priceCredits > 0 — i.e. actually
  // listed) into the cart. The cart drawer auto-opens for feedback.
  const onAdd = async () => {
    if (state !== 'idle' || avatar.urns.length === 0) return
    setState('loading')
    try {
      const ids = avatar.urns.map(itemIdFromUrn).filter((id): id is string => !!id)
      const buyable = (await fetchCatalogByIds(ids, MAINNET_MARKETPLACE)).filter(item => item.priceCredits > 0)
      buyable.forEach(item => add(item, 'carousel'))
      setState(buyable.length > 0 ? 'done' : 'idle')
    } catch {
      setState('idle')
    }
  }

  const label =
    state === 'loading'
      ? t('overview.addLookLoading')
      : state === 'done'
        ? t('overview.addLookDone')
        : t('overview.addLook')

  return (
    <S.Card data-testid="avatar-card" style={{ '--g-frame': avatar.frame, '--g-fade': avatar.fade } as CSSProperties}>
      <S.Frame data-testid="card-frame" />
      <S.Mask>
        <S.Image src={avatar.src} alt="" aria-hidden loading="lazy" data-testid="card-media" />
      </S.Mask>
      <S.Fade />
      {/* A look with no listed items resolves to nothing and the click is a no-op. */}
      <S.AddButton
        type="button"
        data-testid="avatar-add"
        data-state={state}
        disabled={state === 'loading'}
        onClick={() => void onAdd()}
      >
        <Icon name={state === 'done' ? 'check-rounded' : 'cart-solid'} size={18} />
        {label}
      </S.AddButton>
    </S.Card>
  )
}

export function AvatarShowcase() {
  return (
    <CardCarousel title={t('overview.readyToUseAvatars')} count={AVATARS.length}>
      {AVATARS.map((a, i) => (
        <AvatarCard key={i} avatar={a} />
      ))}
    </CardCarousel>
  )
}
