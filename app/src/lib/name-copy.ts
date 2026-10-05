import { t } from '~/intl/i18n'
import { friendlyError } from '~/lib/errors'
import { isWrongNetworkError } from '~/lib/network'
import {
  NameFeeShortError,
  NameInFlightError,
  NameManaShortError,
  NameNotRegisteredError,
  NameQuoteMovedError,
  NameRefundedError,
  NameRouteCostTooHighError,
  NameRouteUnavailableError,
  NameSettlementUnknownError,
  NameTakenError
} from '~/lib/names'

export type NameRail = 'credits' | 'combined' | 'mana'

/** What the buyer is told when a NAME purchase fails, for the rail it failed on. */
export function nameFailureCopy(e: unknown, rail: NameRail): string {
  if (e instanceof NameRouteCostTooHighError) return t('names.errorRouteCost')
  // "Your Credits were used" is not true of a NAME paid without any.
  if (e instanceof NameNotRegisteredError) {
    return t(rail === 'mana' ? 'names.errorNotRegisteredPayment' : 'names.errorNotRegistered')
  }
  if (e instanceof NameSettlementUnknownError) return t('names.errorSettlementUnknown')
  if (e instanceof NameRefundedError) return t('names.errorRefunded')
  if (e instanceof NameQuoteMovedError) return t('names.manaPriceMoved')
  if (e instanceof NameRouteUnavailableError) return t('names.manaRouteUnavailable')
  if (e instanceof NameManaShortError) return t('names.manaNotEnough')
  if (e instanceof NameFeeShortError) return t('names.manaNotEnoughFee')
  if (e instanceof NameTakenError) return t('names.taken')
  if (e instanceof NameInFlightError) return t('names.errorInFlight')
  if (isWrongNetworkError(e)) return friendlyError(e, t('names.errorGeneric'))
  // The libs throw user-safe messages for everything else.
  return (e as { message?: string } | null)?.message || t('names.errorGeneric')
}

/**
 * Whether a retry could pay for this NAME a second time, or for nothing: the money may already be spent, the
 * NAME is gone, or the first purchase is still landing.
 */
export function nameFailureIsFinal(e: unknown): boolean {
  return (
    e instanceof NameNotRegisteredError ||
    e instanceof NameSettlementUnknownError ||
    e instanceof NameTakenError ||
    e instanceof NameInFlightError
  )
}

/** Why the MANA-alone purchase cannot be confirmed yet, or null when it can. */
export function manaAloneBlockedCopy(state: {
  failed: boolean
  quoted: boolean
  manaShort: boolean
  feeShort: boolean
}): string | null {
  if (state.failed) return t('names.manaRouteUnavailable')
  if (!state.quoted) return t('names.manaQuoteLoading')
  if (state.manaShort) return t('names.manaNotEnough')
  if (state.feeShort) return t('names.manaNotEnoughFee')
  return null
}

/** The route's fee in dollars, in the buyer's locale, never shown as nothing. */
export function formatFeeUsd(usd: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(Math.max(usd, 0.01))
}
