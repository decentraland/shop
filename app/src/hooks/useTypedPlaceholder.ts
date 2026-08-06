import { useEffect, useMemo, useState } from 'react'

/**
 * Types example names into a field's placeholder, one character at a time, so an empty input reads as
 * an invitation rather than as a label.
 *
 * It drives the PLACEHOLDER, never the value: nothing here can end up in what gets submitted, and the
 * field stays empty for every check that looks at it. It also stops for good the moment the reader
 * touches the field — an animation that keeps running under someone's cursor is noise.
 */

/** Per character while a word is being typed in. */
const TYPE_MS = 60

/** How long the finished word sits there before it is wiped. */
const HOLD_MS = 700

/** Per character on the way out — quicker than typing, the way a backspace feels. */
const ERASE_MS = 25

export type Frame = { text: string; delay: number }

/**
 * The frames one example runs through: typed in, held whole, then wiped back to a single character.
 *
 * It stops at one rather than none on purpose. The field sizes itself to this text so the ".dcl.eth"
 * suffix stays glued to it, and an empty frame would collapse that width to nothing and snap the
 * suffix across the field between every pair of names.
 */
export function framesFor(word: string): Frame[] {
  if (!word) return []
  const frames: Frame[] = []
  for (let i = 1; i <= word.length; i++) frames.push({ text: word.slice(0, i), delay: TYPE_MS })
  frames[frames.length - 1] = { text: word, delay: HOLD_MS }
  for (let i = word.length - 1; i >= 1; i--) frames.push({ text: word.slice(0, i), delay: ERASE_MS })
  return frames
}

/** Every example's frames, end to end; the hook walks this and wraps around. */
export function framesForAll(words: readonly string[]): Frame[] {
  return words.flatMap(framesFor)
}

/**
 * @param words examples to cycle through
 * @param enabled false freezes it and returns '' — the caller then shows its own static placeholder
 */
export function useTypedPlaceholder(words: readonly string[], enabled: boolean): string {
  const frames = useMemo(() => framesForAll(words), [words])
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!enabled || frames.length === 0) return
    // One timeout per frame, rescheduled by the state change it causes. The guard has to live INSIDE
    // the callback, not around the scheduling: StrictMode's mount/cleanup/mount would otherwise cancel
    // the only timer that was ever set and the animation would never start in dev.
    const id = setTimeout(() => setI(n => (n + 1) % frames.length), frames[i % frames.length].delay)
    return () => clearTimeout(id)
  }, [i, enabled, frames])

  if (!enabled || frames.length === 0) return ''
  return frames[i % frames.length].text
}
