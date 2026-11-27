import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError, Result } from '../domain/types'
import { idemKey } from '../services/api'

const RETRY_MS = 2000

/**
 * Submit with offline queueing. The idempotency key is fixed for the whole
 * attempt, so retries after a network failure (503) can never create a
 * duplicate. Other errors stop and are shown.
 */
export function useSubmitWithRetry<T>(name: string, fn: (key: string) => Promise<Result<T>>) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'sending'>('idle')
  const [error, setError] = useState<ApiError | null>(null)
  const keyRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const submit = useCallback(
    (onDone: (data: T) => void) => {
      if (phase !== 'idle') return
      keyRef.current = idemKey(name)
      setError(null)
      setPhase('busy')
      const attempt = async () => {
        const res = await fnRef.current(keyRef.current!)
        if (!alive.current) return
        if (res.ok) {
          keyRef.current = null
          setPhase('idle')
          onDone(res.data)
        } else if (res.error.code === 503) {
          setPhase('sending')
          timer.current = setTimeout(attempt, RETRY_MS)
        } else {
          keyRef.current = null
          setPhase('idle')
          setError(res.error)
        }
      }
      void attempt()
    },
    [name, phase],
  )
  return { submit, phase, error }
}
