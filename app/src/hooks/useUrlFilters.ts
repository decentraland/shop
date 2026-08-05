import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Filter state that lives in the URL, so a refresh, a shared link or the back button all keep it.
 *
 * ONE hook owning the whole set rather than one per value: picking a category also clears the
 * sub-category, and two independent setters reading the same `searchParams` snapshot would each write
 * their own change over the other's. A single merge per user action cannot clobber itself.
 *
 * Defaults are never written. A URL only carries what the reader actually chose, so the shared link is
 * short and "no filters" has exactly one spelling.
 */
export type FilterValue = string | string[] | boolean | null

/** Values are encoded by the shape of their DEFAULT, which is also what a value must fall back to. */
function encode(value: FilterValue): string | null {
  if (value === null || value === false || value === '') return null
  if (Array.isArray(value)) return value.length ? value.join(',') : null
  if (value === true) return 'true'
  return String(value)
}

function decode(raw: string | null, fallback: FilterValue): FilterValue {
  if (raw === null) return fallback
  if (Array.isArray(fallback)) return raw ? raw.split(',').filter(Boolean) : []
  if (typeof fallback === 'boolean') return raw === 'true'
  return raw
}

/**
 * `drop` removes keys this hook does not own, in the SAME write as the patch. A page that has to clear its
 * own flag alongside a filter cannot do it in a second call: that call reads the pre-patch snapshot and
 * silently undoes the first. (The creator page's valueless `?collections` is exactly this — it is written
 * by hand because URLSearchParams.set would spell it `collections=`.)
 */
export function useUrlFilters<T extends Record<string, FilterValue>>(
  defaults: T
): [T, (patch: Partial<T>, opts?: { drop?: string[] }) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  // Recomputed from the URL rather than mirrored into state: the URL is the single source, so the back
  // button and an edited address bar both work without a sync effect.
  const values = useMemo(() => {
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      out[key] = decode(searchParams.get(String(key)), defaults[key]) as T[keyof T]
    }
    return out
  }, [searchParams, defaults])

  const setFilters = useCallback(
    (patch: Partial<T>, opts?: { drop?: string[] }) => {
      setSearchParams(
        current => {
          const next = new URLSearchParams(current)
          for (const key of opts?.drop ?? []) next.delete(key)
          for (const [key, value] of Object.entries(patch) as [string, FilterValue][]) {
            const encoded = encode(value)
            // A value equal to its default is absent, not spelled out — including when the patch is what
            // resets it, which is how "clear all" leaves a clean URL.
            if (encoded === null || encoded === encode(defaults[key])) next.delete(key)
            else next.set(key, encoded)
          }
          return next
        },
        // A filter tweak is not a place in history: pushing one entry per keystroke in the price box would
        // turn Back into an undo log for filters instead of the way back to the page before.
        { replace: true }
      )
    },
    [setSearchParams, defaults]
  )

  return [values, setFilters]
}
