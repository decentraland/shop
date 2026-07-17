import { useEffect } from 'react'
import { useToast, type Toast } from '~/store/toast'

const ICON: Record<Toast['kind'], string> = { success: '✓', error: '!', info: 'i' }

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToast(s => s.dismiss)
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), 4500)
    return () => clearTimeout(id)
  }, [t.id, dismiss])

  // Errors are announced assertively (role="alert"); success/info stay polite (role="status").
  return (
    <div
      className={`toast toast--${t.kind}`}
      role={t.kind === 'error' ? 'alert' : 'status'}
      onClick={() => dismiss(t.id)}
    >
      <span className="toast__icon" aria-hidden>
        {ICON[t.kind]}
      </span>
      <span className="toast__msg">{t.message}</span>
    </div>
  )
}

export function Toaster() {
  const toasts = useToast(s => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map(t => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  )
}
