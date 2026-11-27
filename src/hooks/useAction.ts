import { useCallback, useRef, useState } from 'react'
import type { ApiError, Result } from '../domain/types'
import { idemKey } from '../services/api'

/**
 * Run a write through the service layer with busy/error state. One
 * idempotency key per attempt; repeat taps while busy are ignored.
 */
export function useAction<A extends unknown[], T>(name: string, fn: (key: string, ...args: A) => Promise<Result<T>>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const inflight = useRef(false)
  const run = useCallback(
    async (...args: A): Promise<Result<T> | null> => {
      if (inflight.current) return null
      inflight.current = true
      setBusy(true)
      setError(null)
      try {
        const res = await fn(idemKey(name), ...args)
        if (!res.ok) setError(res.error)
        return res
      } finally {
        inflight.current = false
        setBusy(false)
      }
    },
    [fn, name],
  )
  return { run, busy, error, setError }
}
