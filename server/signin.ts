// Sign-in codes the app emails itself: 6 digits, no link (so nothing opens a
// second page, and inbox link scanners can't use the code up). After a correct
// code the server opens a normal Supabase session for that email.

import { createHash, randomInt } from 'node:crypto'
import type { Result } from '../src/domain/types'
import { normaliseIdentifier } from '../src/services/auth'
import type { Gateway } from './gateway'

export interface Mailer {
  send(msg: { to: string; subject: string; text: string; html: string }): Promise<void>
}

export interface SigninDeps {
  mailer: Mailer
  /** Opens a Supabase session for this email, creating the sign-in if new. */
  openSession(email: string, is18: boolean): Promise<{ access_token: string; refresh_token: string }>
  /** Mixed into the stored hash so a leaked table can't be checked offline. */
  secret: string
}

export const CODE_TTL_MIN = 10

const hash = (secret: string, email: string, code: string) => createHash('sha256').update(`${secret}|${email}|${code}`).digest('hex')

function emailOf(input: unknown): string | null {
  const raw = input && typeof input === 'object' ? (input as { email?: unknown }).email : null
  const id = normaliseIdentifier(String(raw ?? ''))
  return id && id.kind === 'email' ? id.value : null
}

export async function sendSignInCode(input: unknown, gateway: Gateway, deps: SigninDeps): Promise<Result<{ ttl_min: number }>> {
  const email = emailOf(input)
  if (!email) return { ok: false, error: { code: 400, message: 'Please enter a valid email address.' } }
  const is18 = (input as { is_18_confirmed?: unknown }).is_18_confirmed === true
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const wait = await gateway.codeIssue(email, hash(deps.secret, email, code), is18)
  if (wait > 0) return { ok: false, error: { code: 429, message: `We just sent you a code. You can ask for another in ${wait} seconds.` } }
  try {
    await deps.mailer.send({
      to: email,
      subject: `${code} is your A Little More Us code`,
      text: `Your sign-in code is ${code}\n\nType it into the app. It works for ${CODE_TTL_MIN} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;color:#3b2a24;max-width:420px"><p>Your sign-in code for A Little More Us:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p><p>Type it into the app. It works for ${CODE_TTL_MIN} minutes.</p><p style="color:#8a7a72;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`,
    })
  } catch (e) {
    console.error('[signin] email failed', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return { ok: false, error: { code: 503, message: "We couldn't send the email just now. Please try again in a minute." } }
  }
  return { ok: true, data: { ttl_min: CODE_TTL_MIN } }
}

export async function verifySignInCode(input: unknown, gateway: Gateway, deps: SigninDeps): Promise<Result<{ access_token: string; refresh_token: string }>> {
  const email = emailOf(input)
  const code = String((input as { code?: unknown } | null)?.code ?? '').replace(/\D/g, '')
  if (!email || code.length !== 6) return { ok: false, error: { code: 400, message: 'Please type the 6-digit code from the email.' } }
  const r = await gateway.codeCheck(email, hash(deps.secret, email, code))
  if (r.status === 'wrong') {
    return { ok: false, error: { code: 400, message: r.attempts_left > 0 ? `That code didn't match. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.` : "That code didn't match. Please ask for a new code." } }
  }
  if (r.status === 'locked') return { ok: false, error: { code: 429, message: 'Too many wrong tries. Please ask for a new code.' } }
  if (r.status !== 'ok') return { ok: false, error: { code: 400, message: 'That code has expired. Please ask for a new one.' } }
  return { ok: true, data: await deps.openSession(email, r.is_18) }
}
