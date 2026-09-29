import { config } from '~/config'

/**
 * Which of a set of scenes can still be visited.
 *
 * A photo carries where it was taken, but a scene is not forever: the land can be redeployed to
 * something else and a World can be taken down. Offering to jump into a place that is gone is worse
 * than not offering it, so the link is only drawn for the ones the Places catalogue still answers for
 * and has not disabled.
 */

/** A World is a realm of its own; everything else is a coordinate in Genesis City. */
export function isWorldRealm(realm: string): boolean {
  return realm.endsWith('.eth')
}

/** What a scene is keyed by here: its World name, or its coordinates. */
export function sceneKey(scene: { position: string; realm: string }): string | null {
  if (isWorldRealm(scene.realm)) return scene.realm
  if (!/^-?\d+,-?\d+$/.test(scene.position)) return null
  return scene.position
}

type PlaceRow = { disabled?: boolean; base_position?: string; world_name?: string; positions?: string[] }

async function query(path: string, param: string, values: string[]): Promise<PlaceRow[]> {
  if (values.length === 0) return []
  const qs = new URLSearchParams()
  for (const v of values) qs.append(param, v)
  const res = await fetch(`${config.placesApiUrl}/${path}?${qs.toString()}`)
  if (!res.ok) throw new Error(`places ${path} ${res.status}`)
  const body = (await res.json()) as { data?: PlaceRow[] }
  return body.data ?? []
}

/**
 * The subset of `keys` (from `sceneKey`) that is live right now. One request for the coordinates and
 * one for the Worlds, whatever the size of the set.
 */
export async function fetchLiveScenes(keys: string[]): Promise<Set<string>> {
  const worlds = keys.filter(k => k.endsWith('.eth'))
  const positions = keys.filter(k => !k.endsWith('.eth'))
  const [placeRows, worldRows] = await Promise.all([
    query('places', 'positions', positions),
    query('worlds', 'names', worlds)
  ])
  const live = new Set<string>()
  for (const row of placeRows) {
    if (row.disabled) continue
    // A place answers for every parcel it occupies, not only the one asked about.
    for (const p of row.positions ?? []) if (positions.includes(p)) live.add(p)
    if (row.base_position && positions.includes(row.base_position)) live.add(row.base_position)
  }
  for (const row of worldRows) {
    if (!row.disabled && row.world_name) live.add(row.world_name)
  }
  return live
}
