import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { useWallet } from '~/store/wallet'
import * as S from './PrelaunchNotice.styles'

/**
 * The holding page shown while the Shop is live but not announced (see useShopPrelaunch).
 *
 * Says nothing about allowlists, wallets or dates. Someone who lands here before launch should read it as
 * "not ready yet" and leave — naming a mechanism would invite them to look for the way around it, and this
 * curtain would not survive being looked for. The one hint about early access is shown only to a visitor who
 * has already connected a wallet, because they are the only person for whom it explains anything.
 *
 * Deliberately renders no NavBar, footer or router links: every one of those is a door into a Shop that is
 * meant to be closed, and half of them would 404 anyway once the routes below are not mounted.
 */
export function PrelaunchNotice() {
  const connected = useWallet(s => !!s.session?.address)

  // noindex while the curtain is up, and it needs no undoing: this component only renders while the flag is
  // armed, so turning the flag off stops the call and the real pages set `index,follow` themselves. Keeping
  // the tag inside the thing it describes is what keeps launch day a flag flip with no deploy — a noindex
  // that had to be removed by merging something would put the release back on the deploy pipeline.
  //
  // Caveat worth knowing: this is applied after render, so it only reaches crawlers that execute JS (Google
  // does). One that doesn't sees index.html's static `index,follow` and indexes the empty shell — which is a
  // pre-existing property of shipping a SPA, not something the curtain introduces.
  useSeo({ title: t('prelaunch.title'), description: t('prelaunch.body'), noindex: true })

  return (
    <S.Wrapper role="status" data-testid="prelaunch-notice">
      <S.Logo aria-hidden />
      <S.Title>{t('prelaunch.title')}</S.Title>
      <S.Body>{t('prelaunch.body')}</S.Body>
      {connected ? <S.Hint>{t('prelaunch.connected')}</S.Hint> : null}
    </S.Wrapper>
  )
}

export default PrelaunchNotice
