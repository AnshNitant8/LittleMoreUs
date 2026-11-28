// Two demo accounts for showing the app: already signed up, onboarded and
// paired. Signing in to them takes the DEMO_PASSCODE (a Vercel setting) instead
// of an email link. Off when DEMO_PASSCODE is not set.

import { timingSafeEqual } from 'node:crypto'
import type { Result } from '../src/domain/types'
import { handleRpc, type Caller, type RpcDeps } from './rpc'

export interface DemoDeps {
  passcode: string
  /** Makes sure a confirmed sign-in exists for this email and returns its id. */
  ensureAuthUser(email: string): Promise<string>
  /** Opens a session for this email. */
  openSession(email: string): Promise<{ access_token: string; refresh_token: string }>
}

export const DEMO = {
  a: { email: 'demo.partner.a@example.com', name: 'Priya', label: 'Mama' },
  b: { email: 'demo.partner.b@example.com', name: 'Arjun', label: 'Papa' },
} as const

const ALL = ['remember_us', 'our_journey', 'little_appreciations', 'what_we_need', 'lets_play']

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function as<T>(caller: Caller, deps: RpcDeps, fn: string, arg?: unknown, pending: string | null = null): Promise<T> {
  const out = await handleRpc({ fn, args: arg === undefined ? [] : [arg], client: { pending_invite: pending } }, caller, deps)
  if (!out.result.ok) throw new Error(`demo setup ${fn}: ${out.result.error.message}`)
  return out.result.data as T
}

/** Creates the demo couple the first time; later calls only check it exists. */
async function ensureCouple(deps: RpcDeps, demo: DemoDeps) {
  const a: Caller = { auth_id: await demo.ensureAuthUser(DEMO.a.email), email: DEMO.a.email, is_18_confirmed: true }
  const b: Caller = { auth_id: await demo.ensureAuthUser(DEMO.b.email), email: DEMO.b.email, is_18_confirmed: true }
  if ((await deps.gateway.accountExists(DEMO.a.email)) && (await deps.gateway.accountExists(DEMO.b.email))) return
  let n = 0
  const k = () => `demo-${Date.now().toString(36)}-${++n}`
  await as(a, deps, 'completeSignIn', { is_18_confirmed: true })
  await as(a, deps, 'updateMe', { age_band: '7_12', idempotencyKey: k() })
  await as(a, deps, 'updateMe', { display_name: DEMO.a.name, parent_label: DEMO.a.label, idempotencyKey: k() })
  await as(a, deps, 'updatePreferences', { categories: ALL, depth: 'mix', idempotencyKey: k() })
  const { token } = await as<{ token: string }>(a, deps, 'createInvitation', { idempotencyKey: k(), timezone: 'Asia/Kolkata' })
  await as(b, deps, 'completeSignIn', { is_18_confirmed: true }, token)
  await as(b, deps, 'acceptInvitation', { token, idempotencyKey: k() }, token)
  await as(b, deps, 'updateMe', { age_band: '7_12', idempotencyKey: k() })
  await as(b, deps, 'updateMe', { display_name: DEMO.b.name, parent_label: DEMO.b.label, idempotencyKey: k() })
  await as(b, deps, 'updatePreferences', { categories: ALL, depth: 'mix', idempotencyKey: k() })
  await as(b, deps, 'updateMe', { onboarding_complete: true, idempotencyKey: k() })
  await as(a, deps, 'updateMe', { onboarding_complete: true, idempotencyKey: k() })
}

export async function demoSignIn(input: unknown, deps: RpcDeps): Promise<Result<{ access_token: string; refresh_token: string }>> {
  const demo = deps.demo
  if (!demo) return { ok: false, error: { code: 404, message: 'Demo sign-in is not switched on.' } }
  const who = (input as { who?: unknown } | null)?.who
  const passcode = String((input as { passcode?: unknown } | null)?.passcode ?? '').trim()
  if (who !== 'a' && who !== 'b') return { ok: false, error: { code: 400, message: 'Choose a demo partner.' } }
  if (!same(passcode, demo.passcode)) return { ok: false, error: { code: 403, message: "That demo passcode isn't right." } }
  await ensureCouple(deps, demo)
  return { ok: true, data: await demo.openSession(DEMO[who].email) }
}
