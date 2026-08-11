import { useCallback, useEffect, useRef, useState } from 'react'
import { captureError } from '~/lib/monitoring'

const RESET_MS = 1500

/**
 * Copies text to the clipboard and reports a short-lived `copied` flag so callers can show
 * confirmation. The timer is cleared on unmount so a copy right before navigation can't set state
 * on a gone component.
 */
export function useCopyToClipboard(flow: string) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), RESET_MS)
      } catch (err) {
        captureError(err, { flow })
      }
    },
    [flow]
  )

  return { copied, copy }
}
