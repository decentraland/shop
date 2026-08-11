import { peerUrlFor } from '~/lib/urn'

/**
 * A PUBLISHED EMOTE, AS THE PREVIEW'S `base64s` PROP WANTS IT.
 *
 * Unity's builder mode plays exactly one emote, and it takes it from `base64s`: an emote named among the
 * worn `urns` is filtered out before the avatar is composed, and the `emote` prop only names the built-in
 * animations (idle, fashion, clap…), which it resolves against a local file — hand it a URN and the load
 * fails. So the whole definition has to travel, base64-encoded, the way the Builder sends the item being
 * authored.
 *
 * Babylon reads `base64s` too and prefers it over the same emote found by URN, so both renderers land on
 * the outfit's emote.
 */

type ActiveEntity = {
  content?: { file: string; hash: string }[]
  metadata?: EmoteMetadata
}

type EmoteMetadata = {
  emoteDataADR74?: {
    representations?: { contents?: string[] }[]
    loop?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Whether a preview `emote` value names a published emote rather than one of the built-in animations. */
export function isEmoteUrn(emote: string): emote is `urn:decentraland:${string}` {
  return emote.startsWith('urn:')
}

/** A published emote ready for the preview: what to send, and whether it plays once or on a loop. */
export type EmotePlayback = {
  base64: string
  /** The emote's own `loop`. The preview needs it told separately — see `disableDefaultEmotes` on the caller. */
  loop: boolean
}

/**
 * The entity as a base64 emote definition, or null when it isn't an emote (or carries no usable
 * representation). The one real difference from the raw entity: each representation's `contents` goes from
 * file names to {key, url} pairs, since the renderer downloads the files itself and the entity only names
 * them. Content the entity doesn't hold a hash for is dropped — a representation that loses its `mainFile`
 * this way is rejected by the renderer rather than half-loaded.
 */
export function toEmoteBase64(entity: ActiveEntity, peerUrl: string): EmotePlayback | null {
  const data = entity.metadata?.emoteDataADR74
  if (!data?.representations?.length) return null

  const hashes = new Map((entity.content ?? []).map(c => [c.file, c.hash]))
  const representations = data.representations.map(rep => ({
    ...rep,
    contents: (rep.contents ?? [])
      .filter(key => hashes.has(key))
      .map(key => ({ key, url: `${peerUrl}/content/contents/${hashes.get(key)}` }))
  }))
  if (representations.every(rep => rep.contents.length === 0)) return null

  return {
    base64: encode({ ...entity.metadata, emoteDataADR74: { ...data, representations } }),
    loop: !!data.loop
  }
}

// btoa is Latin-1 only, and the definition ends up in the renderer's URL — drop anything outside printable
// ASCII (emoji in emote names) first, as the Builder does before sending its own.
function encode(definition: unknown): string {
  return btoa(JSON.stringify(definition).replace(/[^\x20-\x7f]/g, ''))
}

/**
 * The base64 definition for an emote URN, from the Catalyst that holds it — the one its OWN network names,
 * not the app's (see `peerUrlFor`). Fail-soft: null means the preview simply plays no emote, which must
 * never be worse than the avatar not rendering at all.
 */
export async function fetchEmoteBase64(
  urn: string,
  peerUrl: string = peerUrlFor([urn]),
  signal?: AbortSignal
): Promise<EmotePlayback | null> {
  try {
    const res = await fetch(`${peerUrl}/content/entities/active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pointers: [urn] }),
      signal
    })
    if (!res.ok) {
      await res.body?.cancel()
      return null
    }
    const [entity] = (await res.json()) as ActiveEntity[]
    return entity ? toEmoteBase64(entity, peerUrl) : null
  } catch {
    return null
  }
}
