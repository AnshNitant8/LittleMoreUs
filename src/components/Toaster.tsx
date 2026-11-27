import { useEffect, useRef, useState } from 'react'
import type { AppNotification } from '../domain/types'
import { useService } from '../hooks/useService'
import { listNotifications } from '../services/api'

/** Simulated push: shows a small toast when a new notification is delivered to the active user. */
export function Toaster({ userId }: { userId: string | null }) {
  const { state } = useService(() => listNotifications(userId ?? '__none__'), [userId])
  const seen = useRef<Set<string> | null>(null)
  const [toast, setToast] = useState<AppNotification | null>(null)

  useEffect(() => {
    seen.current = null // new user: treat existing notifications as already seen
  }, [userId])

  useEffect(() => {
    if (state.status !== 'ready') return
    if (!seen.current) {
      seen.current = new Set(state.data.map((n) => n.id))
      return
    }
    const fresh = state.data.find((n) => !seen.current!.has(n.id))
    state.data.forEach((n) => seen.current!.add(n.id))
    if (fresh) setToast(fresh)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
      {toast && (
        <div className="pointer-events-auto flex max-w-[400px] items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-lg">
          <span aria-hidden="true">💌</span>
          <p className="text-sm">{toast.body}</p>
          <button type="button" className="ml-auto min-h-11 min-w-11 text-white/80" aria-label="Dismiss notification" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
