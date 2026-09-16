import { useEffect, useLayoutEffect, useState } from 'react'
import { useToast, type Toast } from '~/store/toast'
import * as S from './Toaster.styles'

const ICON: Record<Toast['kind'], string> = { success: '✓', error: '!', info: 'i' }

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToast(s => s.dismiss)
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), 4500)
    return () => clearTimeout(id)
  }, [t.id, dismiss])

  // Errors are announced assertively (role="alert"); success/info stay polite (role="status").
  return (
    <S.Item
      data-testid="toast"
      data-kind={t.kind}
      role={t.kind === 'error' ? 'alert' : 'status'}
      onClick={() => dismiss(t.id)}
    >
      <S.Icon data-kind={t.kind} aria-hidden>
        {ICON[t.kind]}
      </S.Icon>
      <S.Msg>{t.message}</S.Msg>
    </S.Item>
  )
}

// The sub-nav is sticky under the navbar and its height depends on viewport and flags, so the stack's
// offset is read from it instead of duplicating that height. Until measured, CSS puts it under the navbar.
function useSubnavBottom(): number | null {
  const [bottom, setBottom] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = document.querySelector('[data-testid="subnav"]')
    if (!el) return
    const update = () => setBottom(el.getBoundingClientRect().bottom)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return bottom
}

function ToastList({ toasts }: { toasts: Toast[] }) {
  const bottom = useSubnavBottom()
  return (
    <S.List data-testid="toaster" aria-live="polite" style={bottom === null ? undefined : { top: bottom + 12 }}>
      {toasts.map(t => (
        <ToastItem key={t.id} t={t} />
      ))}
    </S.List>
  )
}

export function Toaster() {
  const toasts = useToast(s => s.toasts)
  return toasts.length === 0 ? null : <ToastList toasts={toasts} />
}
