import { BodyShape } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'
import type { ProfileAvatar } from '~/hooks/useProfile'
import { t } from '~/intl/i18n'

// Body-shape / avatar–item compatibility.
//
// A wearable can support only BaseMale, only BaseFemale, or both. Mounting an item on an avatar whose
// body shape the item doesn't support renders it INVISIBLE (there's no mesh for that body). So instead
// of putting incompatible items on the connected avatar (and showing nothing), we mirror the builder:
// preview on a default mannequin of a shape the item DOES support. Emotes + unisex items work on both.

// BodyShape.MALE / .FEMALE are the BaseMale/BaseFemale URNs — the type WearablePreview's `bodyShape`
// prop expects.
export const BASE_MALE = BodyShape.MALE
export const BASE_FEMALE = BodyShape.FEMALE
export type BodyShapeUrn = BodyShape

type ItemLike = Pick<CatalogItem, 'gender' | 'category'>

// The shapes an item can render on, from its already-derived gender (see lib/api.ts toGender).
export function itemShapes(item: ItemLike): BodyShapeUrn[] {
  if (item.category === 'emote') return [BASE_MALE, BASE_FEMALE] // shape-agnostic in preview
  switch (item.gender) {
    case 'male':
      return [BASE_MALE]
    case 'female':
      return [BASE_FEMALE]
    default:
      return [BASE_MALE, BASE_FEMALE] // unisex / unknown (e.g. skins)
  }
}

// The connected avatar's body shape, from the Catalyst profile. null when unknown / no avatar.
export function avatarShape(profile?: ProfileAvatar): BodyShapeUrn | null {
  const urn = profile?.avatar?.bodyShape
  if (!urn) return null
  return urn.includes('BaseFemale') ? BASE_FEMALE : BASE_MALE
}

export function isCompatible(item: ItemLike, shape: BodyShapeUrn | null): boolean {
  return shape == null || itemShapes(item).includes(shape)
}

// Localized body-shape label. Returns a plain string (via t()) rather than the literal union so it
// can be dropped straight into JSX; callers only ever render it as text.
export function shapeLabel(shape: BodyShapeUrn): string {
  return shape === BASE_FEMALE ? t('bodyShape.female') : t('bodyShape.male')
}

/**
 * The ONE shape a whole set must be worn on, when the set leaves no choice: a male-only or female-only
 * piece makes every other shape render it invisible, so it decides the body the set is previewed on.
 *
 * Null when the set imposes nothing — all unisex — or when gendered pieces disagree and no single shape
 * can wear them all; the caller then picks the body on its own terms.
 */
export function requiredShape(items: ItemLike[]): BodyShapeUrn | null {
  const shapes = items.reduce<BodyShapeUrn[]>(
    (acc, item) => acc.filter(shape => itemShapes(item).includes(shape)),
    [BASE_MALE, BASE_FEMALE]
  )
  return shapes.length === 1 ? shapes[0] : null
}

// The majority body shape among the gendered items in a set (ties → male); null when none are gendered
// (all unisex/emotes). Used to pick a fitting-room target shape when no avatar is connected.
export function dominantShape(items: ItemLike[]): BodyShapeUrn | null {
  let male = 0
  let female = 0
  for (const it of items) {
    if (it.category === 'emote') continue
    if (it.gender === 'male') male++
    else if (it.gender === 'female') female++
  }
  if (male === 0 && female === 0) return null
  return female > male ? BASE_FEMALE : BASE_MALE
}
