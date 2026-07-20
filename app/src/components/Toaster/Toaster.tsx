import { useEffect } from 'react'
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
      <S.Icon aria-hidden>{ICON[t.kind]}</S.Icon>
      <S.Msg>{t.message}</S.Msg>
    </S.Item>
  )
}

export function Toaster() {
  const toasts = useToast(s => s.toasts)
  if (toasts.length === 0) return null
  return (
    <S.List data-testid="toaster" aria-live="polite">
      {toasts.map(t => (
        <ToastItem key={t.id} t={t} />
      ))}
    </S.List>
  )
}
