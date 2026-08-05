import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getNetwork } from '@dcl/schemas/dist/dapps/chain-id'
import { Network } from '@dcl/schemas/dist/dapps/network'
import { Chevron } from '~/components/Chevron'
import { useWalletChain, chainLabel } from '~/hooks/useWalletChain'
import { track } from '~/lib/analytics'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { useWallet } from '~/store/wallet'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import * as S from './NetworkSelector.styles'

/**
 * The wallet's network, in the global navbar, with the supported ones behind it.
 *
 * WHY THE SHOP'S OWN AND NOT ui2's: decentraland-ui2's Navbar does take `selectedChain`/`chains`/
 * `onSelectChain`, but it renders them as a pill INSIDE the avatar panel — two clicks from anything, so it
 * cannot answer "what network am I on?" without being hunted for, which is the whole complaint. Its options
 * are also non-focusable `role="option"` divs with no `aria-expanded`, no Escape handling and no test
 * hooks, and its labels are hardcoded English while every string here goes through `t()`. ui2's standalone
 * `ChainSelector` export is a MUI modal, which needs a theme provider the shop mounts nowhere global and is
 * far heavier than a navbar affordance should be. So the chain props are deliberately NOT passed to
 * <TopNav> (ui2 hides its pill when they are absent) and this renders into the navbar's slot instead.
 *
 * Switching only ever happens in `onSelect`, straight off the click — see useWalletChain for why that
 * matters to the wallet.
 */

// A network's dot colour, from existing tokens: the Polygon family purple (its brand colour, and the one
// people already associate with the L2), Ethereum's grey. Only the family matters, so mainnet and its
// testnet share a colour — a "Polygon" dot means the same thing on prod and on .zone.
function tintFor(chainId: number): string {
  return getNetwork(chainId) === Network.MATIC ? theme.colors.rarity : theme.colors.muted1
}

export function NetworkSelector() {
  const session = useWallet(s => s.session)
  // Managed (web2) wallets — Magic, thirdweb — have no network for the user to choose and never see wallet
  // jargon (CONVENTIONS.md), the same gate the Approvals tab uses. The hook is given null rather than the
  // component simply returning early, so those sessions never even ask the wallet where it is.
  const selfCustody = !!session && showsWalletConfirmations(session.providerType)
  const { chainId, chains, pendingChainId, switchTo } = useWalletChain(selfCustody ? session : null)
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Outside-click and Escape, same contract as the shop's other popovers (Dropdown, CartPopover).
  // Escape also hands focus back to the trigger, so a keyboard user is not dropped at the top of the page.
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close(true)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Opening moves focus onto the current network so the arrow keys have somewhere to start.
  useEffect(() => {
    if (!open) return
    const options = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    if (!options?.length) return
    const current = Array.from(options).findIndex(o => o.getAttribute('aria-selected') === 'true')
    options[current === -1 ? 0 : current].focus()
  }, [open])

  // Roving focus within the menu. Buttons already handle Enter/Space themselves.
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    if (!options.length) return
    e.preventDefault()
    const at = options.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? options.length - 1
          : e.key === 'ArrowDown'
            ? (at + 1) % options.length
            : (at - 1 + options.length) % options.length
    options[next].focus()
  }

  async function onSelect(target: number) {
    if (target === chainId) {
      close(true)
      return
    }
    // Same event + payload shape the marketplace emits for its own selector, so the two sites' funnels
    // are comparable. Fired on the intent, not the outcome: a rejected switch is a data point.
    track('Shop Network Switch Requested', { from_chain_id: chainId, to_chain_id: target })
    // The menu stays open across the request so the row can say "confirm in wallet" — that prompt opens
    // in the wallet, off to the side, and a menu that vanished the instant it was clicked reads as "done"
    // for something that has not happened. It closes once the wallet answers, either way, and the label
    // only moves if the answer was yes. (Escape and outside-click still close it, so a wallet that never
    // answers cannot strand the menu open.)
    await switchTo(target)
    close(true)
  }

  // Signed out there is no wallet to report on; and until a chain is known there is nothing true to show.
  if (!selfCustody || chainId === undefined) return null

  const currentLabel = chainLabel(chainId)

  return (
    <S.Root ref={rootRef}>
      <S.Trigger
        ref={triggerRef}
        type="button"
        data-testid="network-selector"
        data-pending={pendingChainId !== undefined || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('network.current', { network: currentLabel })}
        onClick={() => setOpen(o => !o)}
      >
        <S.Dot tint={tintFor(chainId)} aria-hidden />
        <S.Name>{currentLabel}</S.Name>
        <Chevron up={open} size={16} color={theme.colors.text2} aria-hidden />
      </S.Trigger>

      {open ? (
        <S.Menu
          ref={menuRef}
          role="listbox"
          aria-labelledby={titleId}
          data-testid="network-menu"
          onKeyDown={onMenuKeyDown}
        >
          {/* The visible heading IS the list's accessible name — labelled by reference rather than
              duplicated into an aria-label, so a screen reader announces it once. `presentation` keeps a
              non-option child out of the listbox's own semantics. */}
          <S.Heading id={titleId} role="presentation">
            {t('network.title')}
          </S.Heading>
          {chains.map(chain => {
            const selected = chain === chainId
            return (
              <li key={chain} role="none">
                <S.Option
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`network-option-${chain}`}
                  onClick={() => void onSelect(chain)}
                >
                  <S.Dot tint={tintFor(chain)} aria-hidden />
                  {chainLabel(chain)}
                  {selected ? (
                    <S.State>{t('network.connected')}</S.State>
                  ) : pendingChainId === chain ? (
                    <S.State>{t('network.confirmInWallet')}</S.State>
                  ) : null}
                </S.Option>
              </li>
            )
          })}
        </S.Menu>
      ) : null}
    </S.Root>
  )
}

export default NetworkSelector
