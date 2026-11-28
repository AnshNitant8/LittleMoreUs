// Browser side of server mode: Supabase sign-in, the one rpc call, and the
// little state this device keeps for itself (drafts, an opened invite link,
// a code in progress). Drafts never leave the device.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiError, Result } from '../../domain/types'
import { emitChange } from '../storage'

let sbPromise: Promise<SupabaseClient> | null = null

export function supabase(): Promise<SupabaseClient> {
  if (import.meta.env.VITE_DEV_AUTH === '1') return Promise.resolve(devAuth())
  sbPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
      // Implicit flow: the link in the sign-in email works even when it opens
      // in a different browser from the one that asked for it.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    }),
  )
  return sbPromise
}

/**
 * Local development only (VITE_DEV_AUTH=1 with `npm run dev:server`): a
 * stand-in for Supabase sign-in where the code is always 123456. Production
 * builds never set the flag, so this is dropped from them.
 */
function devAuth(): SupabaseClient {
  const KEY = 'almu.devauth'
  const read = () => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  }
  const fake = {
    auth: {
      async getSession() {
        const email = read()
        return { data: { session: email ? { access_token: `dev:${email}` } : null }, error: null }
      },
      async signInWithOtp() {
        return { data: {}, error: null }
      },
      async verifyOtp({ email, token }: { email: string; token: string }) {
        if (token !== '123456') return { data: {}, error: { message: 'Token has expired or is invalid' } }
        localStorage.setItem(KEY, email)
        return { data: {}, error: null }
      },
      async setSession({ access_token }: { access_token: string }) {
        if (!access_token.startsWith('dev:')) return { data: {}, error: { message: 'bad token' } }
        localStorage.setItem(KEY, access_token.slice(4))
        return { data: {}, error: null }
      },
      async signOut() {
        localStorage.removeItem(KEY)
        return { error: null }
      },
    },
  }
  return fake as unknown as SupabaseClient
}

// ---------- Device-local state ----------

const KEY = 'almu.device.v1'

export interface PendingCode {
  identifier: string
  mode: 'signup' | 'login'
  is_18_confirmed: boolean
  sent_at: number
}

interface DeviceState {
  pending_invite: string | null
  drafts: Record<string, string>
  code: PendingCode | null
}

const blank = (): DeviceState => ({ pending_invite: null, drafts: {}, code: null })
let memory: DeviceState | null = null

export function device(): DeviceState {
  if (memory) return memory
  try {
    memory = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}) }
  } catch {
    memory = blank()
  }
  return memory!
}

export function updateDevice(patch: Partial<DeviceState>) {
  memory = { ...device(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // Private mode: keep it in memory for this visit.
  }
}

// ---------- rpc ----------

const offline: ApiError = { code: 503, message: 'You seem to be offline. We’ll keep trying.' }

/** Reads never notify; everything else may have changed what screens show. */
const isRead = (fn: string) => /^(get|list|lookup)/.test(fn) || fn === 'runScheduledJobs'

export async function rpc<T>(fn: string, args: unknown[] = []): Promise<Result<T>> {
  const sb = await supabase()
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  let res: Response
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ fn, args, client: { pending_invite: device().pending_invite } }),
    })
  } catch {
    return { ok: false, error: offline }
  }
  let body: { result?: Result<T>; client?: { pending_invite: string | null } }
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { code: 500, message: 'Something went wrong. Please try again.' } }
  }
  if (!body.result) return { ok: false, error: { code: 500, message: 'Something went wrong. Please try again.' } }
  if (body.client && body.client.pending_invite !== device().pending_invite) updateDevice({ pending_invite: body.client.pending_invite })
  if (body.result.ok && !isRead(fn)) emitChange()
  return body.result
}

// Partners change things from their own phones: refresh what's on screen now
// and then, and whenever this tab comes back into view.
let started = false
export function startLiveRefresh() {
  if (started || typeof window === 'undefined') return
  started = true
  setInterval(() => {
    if (document.visibilityState === 'visible') emitChange()
  }, 20_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emitChange()
  })
}
