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
  category: string
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
  if (rule.category === 'skin') for (const c of SKIN_COVERS) out.add(c)
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

type ActiveEntity = {
  pointers?: string[]
  metadata?: { data?: { category?: string; hides?: string[]; replaces?: string[] } }
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
    const res = await fetch(`${config.peerUrl}/content/entities/active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pointers: urns })
    })
    if (!res.ok) return []
    const entities = (await res.json()) as ActiveEntity[]
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
