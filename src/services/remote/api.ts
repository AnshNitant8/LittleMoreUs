// Server-mode versions of the service functions. Most simply call the server;
// sign-in uses Supabase email codes, and drafts and an opened invite link stay
// on this device.

import type { Result, User } from '../../domain/types'
import type * as L from '../api.local'
import type { OtpStatus, RequestOtpInput } from '../auth'
import { normaliseIdentifier } from '../auth'
import { emitChange } from '../storage'
import { device, rpc, supabase, updateDevice } from './client'

type Api = typeof L
type Fn<K extends keyof Api> = Api[K]

const RESEND_SEC = 60
/** Supabase's default lifetime for its emailed link; the app's own codes last 10 minutes. */
const CODE_TTL_MS = 60 * 60_000
const OWN_CODE_TTL_MS = 10 * 60_000
const notHere = <T>(): Promise<Result<T>> => Promise.resolve({ ok: false, error: { code: 400, message: 'Not available on the live app.' } })

/** The plain server call for `name`, typed like the local function. */
export function viaServer<K extends keyof Api>(name: K): Fn<K> {
  return ((...args: unknown[]) => rpc(name as string, args)) as unknown as Fn<K>
}

function codeStatus(): OtpStatus | null {
  const c = device().code
  if (!c) return null
  const elapsed = Math.floor((Date.now() - c.sent_at) / 1000)
  return {
    identifier: c.identifier,
    mode: c.mode,
    expires_at: new Date(c.sent_at + (c.own ? OWN_CODE_TTL_MS : CODE_TTL_MS)).toISOString(),
    resend_available_in_sec: Math.max(0, RESEND_SEC - elapsed),
    locked_until: null,
    attempts_left: 5,
  }
}

async function requestOtp(input: RequestOtpInput): Promise<Result<OtpStatus>> {
  const id = normaliseIdentifier(input.identifier ?? '')
  if (!id) return { ok: false, error: { code: 400, message: 'Please enter a valid email address.' } }
  if (id.kind !== 'email') return { ok: false, error: { code: 400, message: "Please use your email address. Signing in with a phone number isn't available yet." } }
  const look = await rpc<{ exists: boolean }>('lookupAccount', [id.value])
  if (!look.ok) return look
  const mode = look.data.exists ? 'login' : 'signup'
  if (mode === 'signup' && input.is_18_confirmed !== true) {
    return { ok: false, error: { code: 400, message: "You're new here. Confirm you're 18 or older and we'll create your account.", new_account: true } }
  }
  // The app's own 6-digit code email, when the server has an email account set up.
  const own = await rpc<{ ttl_min: number }>('sendSignInCode', [{ email: id.value, is_18_confirmed: input.is_18_confirmed === true }])
  if (own.ok) {
    updateDevice({ code: { identifier: id.value, mode, is_18_confirmed: input.is_18_confirmed === true, sent_at: Date.now(), own: true } })
    return { ok: true, data: codeStatus()! }
  }
  if (own.error.message !== 'not_configured') return own
  const sb = await supabase()
  const { error } = await sb.auth.signInWithOtp({
    email: id.value,
    options: {
      shouldCreateUser: true,
      // Tapping the link in the email lands back here and signs in.
      emailRedirectTo: `${window.location.origin}/`,
      // Saved on a new account, so a link opened elsewhere still counts the 18+ tick.
      data: { is_18_confirmed: input.is_18_confirmed === true },
    },
  })
  if (error) {
    const wait = /rate|seconds|security purposes/i.test(error.message)
    return { ok: false, error: { code: wait ? 429 : 400, message: wait ? 'Please wait a minute before asking for another code.' : "We couldn't send a code just now. Please try again." } }
  }
  updateDevice({ code: { identifier: id.value, mode, is_18_confirmed: input.is_18_confirmed === true, sent_at: Date.now() } })
  return { ok: true, data: codeStatus()! }
}

async function verifyOtp(input: { code: string; idempotencyKey: string }): Promise<Result<User>> {
  const c = device().code
  if (!c) return { ok: false, error: { code: 401, message: 'Please request a code first.' } }
  const sb = await supabase()
  const token = (input.code ?? '').replace(/\s/g, '')
  if (c.own) {
    const v = await rpc<{ access_token: string; refresh_token: string }>('verifySignInCode', [{ email: c.identifier, code: token }])
    if (!v.ok) return v
    const { error } = await sb.auth.setSession(v.data)
    if (error) return { ok: false, error: { code: 400, message: "We couldn't finish signing in. Please ask for a new code." } }
  } else {
    const { error } = await sb.auth.verifyOtp({ email: c.identifier, token, type: 'email' })
    if (error) return { ok: false, error: { code: 400, message: "That code didn't match or has expired. Check the latest email, or ask for a new code." } }
  }
  const res = await rpc<User>('completeSignIn', [{ is_18_confirmed: c.is_18_confirmed }])
  if (res.ok) {
    updateDevice({ code: null })
    emitChange()
  }
  return res
}

async function signOutHere(): Promise<Result<true>> {
  const sb = await supabase()
  await sb.auth.signOut().catch(() => undefined)
  updateDevice({ code: null, drafts: {}, pending_invite: null })
  emitChange()
  return { ok: true, data: true }
}

/**
 * Arriving from the link in a sign-in email: Supabase reads the token from the
 * address, then we finish signing in and tidy the address for the app's router.
 */
export async function finishEmailLink(): Promise<void> {
  const h = window.location.hash
  if (!/access_token=|error_code=/.test(h)) return
  const sb = await supabase()
  const { data } = await sb.auth.getSession()
  window.history.replaceState(null, '', `${window.location.pathname}#/`)
  if (!data.session) return
  const res = await rpc('completeSignIn', [{ is_18_confirmed: device().code?.is_18_confirmed === true }])
  if (res.ok) updateDevice({ code: null })
}

/** The functions that work differently in server mode. */
export const overrides: Partial<{ [K in keyof Api]: Api[K] }> = {
  requestOtp,
  verifyOtp,
  getOtpStatus: async () => ({ ok: true, data: codeStatus() }),
  cancelOtp: async () => {
    updateDevice({ code: null })
    return { ok: true, data: true as const }
  },
  logout: async () => signOutHere(),
  getDraft: async (key: string) => ({ ok: true, data: device().drafts[key] ?? '' }),
  saveDraft: async (key: string, text: string) => {
    const drafts = { ...device().drafts }
    if (text.trim()) drafts[key] = text.slice(0, 4000)
    else delete drafts[key]
    updateDevice({ drafts })
    return { ok: true, data: true as const }
  },
  rememberInvite: async (token: string) => {
    updateDevice({ pending_invite: token })
    return { ok: true, data: true as const }
  },
  forgetInvite: async () => {
    updateDevice({ pending_invite: null })
    emitChange()
    return { ok: true, data: true as const }
  },
  createInvitation: (input) => rpc('createInvitation', [{ ...input, timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }]),
  createInteraction: async (input) => {
    const res = await rpc<Awaited<ReturnType<Api['createInteraction']>> extends Result<infer T> ? T : never>('createInteraction', [input])
    if (res.ok) await overrides.saveDraft!(`q:${input.question_id}`, '')
    return res
  },
  respondToInteraction: async (input) => {
    const res = await rpc<Awaited<ReturnType<Api['respondToInteraction']>> extends Result<infer T> ? T : never>('respondToInteraction', [input])
    if (res.ok) await overrides.saveDraft!(`i:${input.interaction_id}`, '')
    return res
  },
  deleteAccount: async (input) => {
    const res = await rpc<Awaited<ReturnType<Api['deleteAccount']>> extends Result<infer T> ? T : never>('deleteAccount', [input])
    if (res.ok) await signOutHere()
    return res
  },
  listNotifications: () => rpc('listNotifications'),
  markNotificationsRead: () => rpc('markNotificationsRead'),
  // Prototype-only controls have no meaning with real accounts.
  switchUser: notHere,
  advanceClock: notHere,
  resetAllPrototypeData: notHere,
  setSimulatedOffline: notHere,
}
