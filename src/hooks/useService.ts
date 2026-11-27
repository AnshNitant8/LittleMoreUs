import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError, Result } from '../domain/types'
import { subscribe } from '../services/storage'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: T }

/**
 * Call a read-only service function and re-run it whenever the store changes.
 * Components never touch storage; they only see results from the service layer.
 */
export function useService<T>(fn: () => Promise<Result<T>>, deps: unknown[] = []) {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  const load = useCallback(async () => {
    const res = await fnRef.current()
    setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error })
  }, [])

  useEffect(() => {
    let alive = true
    let seq = 0
    const run = () => {
      const mine = ++seq
      void fnRef.current().then((res) => {
        // Ignore stale responses that resolve after a newer request.
        if (alive && mine === seq) setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error })
      })
    }
    run()
    const unsub = subscribe(run)
    return () => {
      alive = false
      unsub()
    }
  }, deps)

  return { state, reload: load }
}
