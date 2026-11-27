// Prototype OTP authentication (spec Screen 02). No passwords. The code is
// always 123456. All timing uses the simulated clock. NOT production auth.

import {
  ACCOUNT_RECOVERY_DAYS,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_PREFERENCES,
  OTP_CODE,
  OTP_LOCK_MIN,
  OTP_MAX_FAILS,
  OTP_RESEND_SEC,
  OTP_TTL_MIN,
} from '../domain/constants'
import type { Result, User } from '../domain/types'
import { newId } from '../utils/id'
import { DURATION, nowIso, nowMs } from './clock'
import { activeSession, err, fail, mutate, mutateCommitting, query, track } from './core'
import type { Db } from './storage'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?\d{10,15}$/

export type IdentifierKind = 'email' | 'phone'

/** Normalise and classify a phone number or email. Returns null if invalid. */
export function normaliseIdentifier(raw: string): { value: string; kind: IdentifierKind } | null {
  const t = raw.trim()
  if (t.includes('@')) {
    const v = t.toLowerCase()
    return EMAIL_RE.test(v) ? { value: v, kind: 'email' } : null
  }
  const v = t.replace(/[\s\-().]/g, '')
  return PHONE_RE.test(v) ? { value: v, kind: 'phone' } : null
}

const findByIdentifier = (db: Db, identifier: string) => db.users.find((u) => u.identifier === identifier)

const minutesLeft = (untilIso: string) => Math.max(1, Math.ceil((Date.parse(untilIso) - nowMs()) / DURATION.MINUTE))

export interface RequestOtpInput {
  identifier: string
  mode: 'signup' | 'login'
  /** Required for signup (age gate). */
  is_18_confirmed?: boolean
  idempotencyKey: string
}

export interface OtpStatus {
  identifier: string
  mode: 'signup' | 'login'
  expires_at: string
  resend_available_in_sec: number
  locked_until: string | null
  attempts_left: number
}

export async function requestOtp(input: RequestOtpInput): Promise<Result<OtpStatus>> {
  return mutateCommitting(input.idempotencyKey, (db) => {
    const id = normaliseIdentifier(input.identifier ?? '')
    if (!id) return err(400, 'Please enter a valid phone number (10–15 digits) or email address.')
    if (input.mode !== 'signup' && input.mode !== 'login') return err(400, 'Unknown sign-in mode.')
    if (input.mode === 'signup' && input.is_18_confirmed !== true)
      return err(400, 'Please confirm you are 18 or older to create an account.')

    const existing = findByIdentifier(db, id.value)
    if (input.mode === 'signup' && existing)
      return err(409, 'There is already an account with this. You can log in instead.')
    if (input.mode === 'login' && !existing)
      return err(404, "We couldn't find an account with this. You can create one instead.")
    const otherSlot = db.active_slot === 'A' ? 'B' : 'A'
    if (existing && db.slots[otherSlot].user_id === existing.user_id)
      return err(409, `This account is already signed in as Partner ${otherSlot} in this prototype.`)

    const now = nowMs()
    const ch = db.otp_challenges[id.value]
    if (ch?.locked_until && Date.parse(ch.locked_until) > now)
      return err(429, `Too many attempts. Please try again in ${minutesLeft(ch.locked_until)} minutes.`)
    if (ch && Date.parse(ch.last_sent_at) + OTP_RESEND_SEC * 1000 > now) {
      const wait = Math.ceil((Date.parse(ch.last_sent_at) + OTP_RESEND_SEC * 1000 - now) / 1000)
      return err(429, `Please wait ${wait} seconds before asking for a new code.`)
    }

    const issued = nowIso()
    db.otp_challenges[id.value] = {
      identifier: id.value,
      issued_at: issued,
      last_sent_at: issued,
      expires_at: new Date(now + OTP_TTL_MIN * DURATION.MINUTE).toISOString(),
      // a fresh code resets attempts, unless still within a lockout (handled above)
      failed_attempts: 0,
      locked_until: null,
    }
    activeSession(db).otp = { identifier: id.value, mode: input.mode, is_18_confirmed: input.is_18_confirmed === true }
    track(db, 'otp_requested', { mode: input.mode, kind: id.kind })
    return { ok: true, data: otpStatus(db)! }
  })
}

function otpStatus(db: Db): OtpStatus | null {
  const pending = activeSession(db).otp
  if (!pending) return null
  const ch = db.otp_challenges[pending.identifier]
  if (!ch) return null
  const now = nowMs()
  const locked = ch.locked_until && Date.parse(ch.locked_until) > now ? ch.locked_until : null
  return {
    identifier: pending.identifier,
    mode: pending.mode,
    expires_at: ch.expires_at,
    resend_available_in_sec: Math.max(0, Math.ceil((Date.parse(ch.last_sent_at) + OTP_RESEND_SEC * 1000 - now) / 1000)),
    locked_until: locked,
    attempts_left: Math.max(0, OTP_MAX_FAILS - ch.failed_attempts),
  }
}

/** Current pending OTP on this device, or null. Used for the resend countdown. */
export async function getOtpStatus(): Promise<Result<OtpStatus | null>> {
  return query((db) => otpStatus(db))
}

export async function cancelOtp(): Promise<Result<true>> {
  return mutate(`cancel-otp:${newId('k')}`, (db) => {
    activeSession(db).otp = null
    return true as const
  })
}

export async function verifyOtp(input: { code: string; idempotencyKey: string }): Promise<Result<User>> {
  return mutateCommitting(input.idempotencyKey, (db) => {
    const session = activeSession(db)
    const pending = session.otp
    if (!pending) return err(401, 'Please request a code first.')
    const ch = db.otp_challenges[pending.identifier]
    if (!ch) return err(401, 'Please request a code first.')
    const now = nowMs()

    if (ch.locked_until && Date.parse(ch.locked_until) > now)
      return err(429, `Too many attempts. Please try again in ${minutesLeft(ch.locked_until)} minutes.`)
    if (Date.parse(ch.expires_at) <= now) return err(410, 'This code has expired. Please ask for a new one.')

    const code = (input.code ?? '').replace(/\s/g, '')
    if (code !== OTP_CODE) {
      ch.failed_attempts += 1
      track(db, 'otp_failed', { attempts: ch.failed_attempts })
      if (ch.failed_attempts >= OTP_MAX_FAILS) {
        ch.locked_until = new Date(now + OTP_LOCK_MIN * DURATION.MINUTE).toISOString()
        return err(429, `Too many attempts. Please try again in ${OTP_LOCK_MIN} minutes.`)
      }
      const left = OTP_MAX_FAILS - ch.failed_attempts
      return err(400, `That code didn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
    }

    let user = findByIdentifier(db, pending.identifier)
    if (pending.mode === 'signup') {
      if (user) return err(409, 'There is already an account with this. You can log in instead.')
      user = {
        user_id: newId('usr'),
        identifier: pending.identifier,
        display_name: '',
        parent_label: '',
        age_band: null,
        preferences: structuredClone(DEFAULT_PREFERENCES),
        notification_prefs: structuredClone(DEFAULT_NOTIFICATION_PREFS),
        is_18_confirmed: pending.is_18_confirmed,
        deletion_requested_at: null,
        created_at: nowIso(),
        onboarding_complete: false,
      }
      db.users.push(user)
      track(db, 'signup_completed', { user_id: user.user_id })
    } else {
      if (!user) return err(404, "We couldn't find an account with this. You can create one instead.")
      if (user.deletion_requested_at) {
        const erasedAt = Date.parse(user.deletion_requested_at) + ACCOUNT_RECOVERY_DAYS * DURATION.DAY
        if (erasedAt <= now) return err(410, 'This account has been erased.')
      }
      track(db, 'login_completed', { user_id: user.user_id })
    }
    delete db.otp_challenges[pending.identifier]
    session.otp = null
    session.user_id = user.user_id
    return { ok: true, data: structuredClone(user) }
  })
}

export async function logout(input: { idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const s = activeSession(db)
    if (!s.user_id) fail(401, 'You are not signed in.')
    track(db, 'logout', { user_id: s.user_id })
    s.user_id = null
    s.otp = null
    return true as const
  })
}
