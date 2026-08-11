import { WearableCategory } from '@dcl/schemas'
import { config } from '~/config'

/**
 * WHAT AN EQUIPPED WEARABLE HIDES, from the Catalyst entity that defines it.
 *
 * A wearable declares the categories it covers (`hides`) and the ones it stands in for (`replaces`), and the
 * renderer honours them: equip a skin and your hat stops rendering. That is a problem when we are dressing
 * the shopper's own avatar in a cart item, because the item they came to see can be the thing hidden — the
 * fitting room showed the avatar unchanged and nothing explained why.
 *
 * The preview app resolves this itself, but only for the SINGLE item form of its API (contract + item id);
 * given a list of `urns` it trusts the list. So we resolve the rules here and hand it a composed list.
 */
export type WearableRule = {
  urn: string
  category: WearableCategory
  hides: string[]
  replaces: string[]
}

/**
 * A skin is the whole body, so it renders every body category itself. Skins declare the accessory slots they
 * hide (hat, mask, eyewear…) but not these, which they cover regardless — measured on a real skin, whose
 * `hides` lists nine accessory categories and none of the body. Without this a skin kept its silent grip on
 * upper_body/lower_body/feet, which is the case that started this.
 */
const SKIN_COVERS = [
  'upper_body',
  'lower_body',
  'feet',
  'hands',
  'hands_wear',
  'head',
  'hair',
  'facial_hair',
  'eyebrows',
  'eyes',
  'mouth'
]

// Everything a rule keeps off the avatar: what it declares, plus what its category implies.
export function hiddenBy(rule: WearableRule): Set<string> {
  const out = new Set<string>([...rule.hides, ...rule.replaces])
  if (rule.category === WearableCategory.SKIN) for (const c of SKIN_COVERS) out.add(c)
  return out
}

/**
 * The equipped urns to KEEP when trying `tryOnCategories` on. An equipped wearable goes when it would hide
 * one of them, and when it occupies the same category (that one is a swap, not a conflict — two hats cannot
 * both be worn, and the shopper is here to see the new one).
 *
 * Order is preserved: the avatar's own list order is what the renderer receives.
 */
export function keepEquipped(equipped: WearableRule[], tryOnCategories: string[]): string[] {
  const wanted = new Set(tryOnCategories.filter(Boolean))
  if (wanted.size === 0) return equipped.map(r => r.urn)
  return equipped
    .filter(rule => {
      if (wanted.has(rule.category)) return false
      const hidden = hiddenBy(rule)
      for (const category of wanted) if (hidden.has(category)) return false
      return true
    })
    .map(r => r.urn)
}

// The shopper's face: the only part of their avatar an outfit preview borrows. Hair is NOT one of them —
// the hair COLOR is kept (it is a colour, not a wearable), the hairstyle is not.
const FACE_CATEGORIES = new Set([WearableCategory.EYES, WearableCategory.EYEBROWS, WearableCategory.MOUTH])

/**
 * The equipped urns an OUTFIT preview keeps: the shopper's eyes, eyebrows and mouth, and nothing else.
 *
 * An outfit is a complete look, and the thumbnail its creator published shows it on its own. Dressing it
 * over the shopper's hat, hair and shoes gave a different look from the one they clicked, so the avatar
 * contributes only its face (plus its skin/hair/eye colours, which travel separately) and the outfit
 * fills everything else.
 *
 * Order is preserved, and the caller appends the outfit's urns AFTER these: the renderers resolve one
 * wearable per category in list order, so an outfit that carries its own face item still wins the slot.
 */
export function faceOnly(equipped: WearableRule[]): string[] {
  return equipped.filter(rule => FACE_CATEGORIES.has(rule.category)).map(r => r.urn)
}

type ActiveEntity = {
  pointers?: string[]
  metadata?: { data?: { category?: WearableCategory; hides?: string[]; replaces?: string[]; blockVrmExport?: boolean } }
}

// One POST for a batch of urns. The Catalyst holds the wearable's own definition, so both readers here come
// through it. Rejects like any fetch; each caller decides what "no answer" means for it.
async function fetchActiveEntities(urns: string[]): Promise<ActiveEntity[]> {
  const res = await fetch(`${config.peerUrl}/content/entities/active`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pointers: urns })
  })
  if (!res.ok) return []
  return (await res.json()) as ActiveEntity[]
}

/**
 * Whether the creator blocked VRM export for this wearable — `blockVrmExport` on the entity's data, which no
 * marketplace-server endpoint carries (checked against production: the v1 item has no such field, the entity
 * does). The item page states it as a badge, as the marketplace does: it is a real restriction on what the
 * buyer can do with the item once they own it.
 *
 * Null when we could not find out, which the page treats as nothing to state — never a badge on a guess.
 */
export async function fetchVrmExportBlocked(urn: string): Promise<boolean | null> {
  try {
    const data = (await fetchActiveEntities([urn]))[0]?.metadata?.data
    return data ? !!data.blockVrmExport : null
  } catch {
    return null
  }
}

/**
 * The rules for a list of equipped urns, in ONE request (POST /content/entities/active takes them all as
 * pointers). Unknown urns are simply absent from the answer; the caller keeps those as-is, since a wearable
 * we cannot read cannot be shown to hide anything.
 *
 * Fail-soft: an empty list means "no rules known", and every caller then leaves the avatar alone. Dressing
 * the avatar must never depend on this succeeding.
 */
export async function fetchWearableRules(urns: string[]): Promise<WearableRule[]> {
  if (urns.length === 0) return []
  try {
    const entities = await fetchActiveEntities(urns)
    const byUrn = new Map<string, WearableRule>()
    for (const entity of entities) {
      const data = entity.metadata?.data
      if (!data?.category) continue
      for (const pointer of entity.pointers ?? []) {
        byUrn.set(pointer.toLowerCase(), {
          urn: pointer,
          category: data.category,
          hides: data.hides ?? [],
          replaces: data.replaces ?? []
        })
      }
    }
    // Answer in the order asked, so the caller's list order (the avatar's own) survives.
    return urns.map(urn => byUrn.get(urn.toLowerCase())).filter((r): r is WearableRule => !!r)
  } catch {
    return []
  }
}
