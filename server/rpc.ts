// One endpoint for the whole app: the browser names a service function and its
// arguments; the server loads the caller's data, runs the same rules the
// prototype ran, and saves the changes atomically.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Result } from '../src/domain/types'
import * as api from '../src/services/api.local'
import { newUserRecord, normaliseIdentifier } from '../src/services/auth'
import { activeSession, setDeferHook, track } from '../src/services/core'
import { readDb, setStoreContextResolver, transact, type Db, type StoreContext } from '../src/services/storage'
import { ConflictError, type Gateway } from './gateway'
import { buildDb, diffDb } from './scope'

export interface Caller {
  auth_id: string
  email: string
  /** Confirmed 18+ before the sign-in email was sent (kept on the Supabase account). */
  is_18_confirmed?: boolean
}

export interface RpcRequest {
  fn: string
  args?: unknown[]
  /** State the browser keeps for itself and lends to each call. */
  client?: { pending_invite?: string | null }
}

export interface RpcResponse {
  result: Result<unknown>
  client: { pending_invite: string | null }
}

export interface RpcDeps {
  gateway: Gateway
  adminEmails: string[]
}

interface Ctx extends StoreContext {
  deferred: Promise<unknown>[]
}

const als = new AsyncLocalStorage<Ctx>()
setStoreContextResolver(() => als.getStore())
setDeferHook((p) => als.getStore()?.deferred.push(p))

/** public: anyone; signed-in: a verified email, profile or not; user: has a profile; admin: ADMIN_EMAILS. */
/** Run service code against `db` (the cron job uses this too). */
export async function withDb<T>(db: Db, fn: () => Promise<T>): Promise<{ result: T; db: Db }> {
  const ctx: Ctx = { db, deferred: [] }
  const result = await als.run(ctx, async () => {
    const r = await fn()
    while (ctx.deferred.length) await Promise.all(ctx.deferred.splice(0))
    return r
  })
  return { result, db: ctx.db }
}

type Access = 'public' | 'signed-in' | 'user' | 'admin'
type Fn = (...args: never[]) => Promise<Result<unknown>>

/** What the browser may call, and who may call it. Anything else is refused. */
const PUBLIC = ['getSession', 'getInvitation', 'declineInvitation', 'runScheduledJobs'] as const
const USER = [
  'getMe', 'updateMe', 'getPreferences', 'updatePreferences',
  'createInvitation', 'getMyInvitation', 'acceptInvitation', 'cancelInvitation', 'skipInviteStep', 'getCouple', 'updateCouple',
  'getNextMoment', 'getExplore', 'skipMoment', 'createInteraction', 'listInteractions', 'getHome', 'getInteraction',
  'respondToInteraction', 'declineInteraction', 'withdrawInteraction', 'getNextGame', 'createGame', 'respondToGame', 'getSupportRegion',
  'getStory', 'saveStory', 'reactToStory', 'reportStory', 'regenerateStory', 'resumeGeneration',
  'getEntitlement', 'submitPaymentReference', 'listStories', 'deleteStory', 'requestExport',
  'disconnectCouple', 'deleteAccount', 'cancelAccountDeletion',
] as const
const ADMIN = ['adminListPayments', 'adminVerifyPayment', 'adminListReports', 'adminReviewReport', 'listAnalytics', 'updateFlags', 'getAiStatus', 'testGemini'] as const

const ACCESS = new Map<string, Access>([
  ...PUBLIC.map((n) => [n, 'public'] as const),
  ...USER.map((n) => [n, 'user'] as const),
  ...ADMIN.map((n) => [n, 'admin'] as const),
  ['listNotifications', 'user'],
  ['markNotificationsRead', 'user'],
  ['lookupAccount', 'public'],
  ['getServerInfo', 'public'],
  ['completeSignIn', 'signed-in'],
])

const fail = (code: 400 | 401 | 403 | 404, message: string): RpcResponse => ({ result: { ok: false, error: { code, message } }, client: { pending_invite: null } })

function tokenFrom(fn: string, args: unknown[]): string | null {
  const a = args[0]
  if (fn === 'getInvitation' && typeof a === 'string') return a
  if ((fn === 'acceptInvitation' || fn === 'declineInvitation') && a && typeof a === 'object' && typeof (a as { token?: unknown }).token === 'string') {
    return (a as { token: string }).token
  }
  return null
}

export async function handleRpc(req: RpcRequest, caller: Caller | null, deps: RpcDeps): Promise<RpcResponse> {
  const fn = String(req.fn ?? '')
  const args = Array.isArray(req.args) ? req.args : []
  const access = ACCESS.get(fn)
  if (!access) return fail(404, 'Unknown action.')
  const isAdmin = !!caller && deps.adminEmails.includes(caller.email.toLowerCase())
  if (access !== 'public' && !caller) return fail(401, 'Please sign in to continue.')
  if (access === 'admin' && !isAdmin) return fail(403, 'This is only for the app admin.')

  if (fn === 'getServerInfo') {
    return { result: { ok: true, data: { mode: 'server', is_admin: isAdmin, email: caller?.email ?? null } }, client: { pending_invite: req.client?.pending_invite ?? null } }
  }
  if (fn === 'lookupAccount') {
    const id = normaliseIdentifier(String(args[0] ?? ''))
    if (!id) return fail(400, 'Please enter a valid email address.')
    if (id.kind !== 'email') return fail(400, "Please use your email address. Signing in with a phone number isn't available yet.")
    return { result: { ok: true, data: { exists: await deps.gateway.accountExists(id.value), identifier: id.value } }, client: { pending_invite: req.client?.pending_invite ?? null } }
  }

  const pendingInvite = typeof req.client?.pending_invite === 'string' ? req.client.pending_invite : null
  const token = tokenFrom(fn, args) ?? pendingInvite

  for (let attempt = 1; ; attempt++) {
    const rows = access === 'admin' ? await deps.gateway.loadAll() : await deps.gateway.loadScope(caller?.auth_id ?? null, token)
    if (access === 'admin') rows.me = findMe(rows, caller!.auth_id)
    const { db, snapshot } = buildDb(rows, pendingInvite)
    if (access === 'user' && !rows.me) return fail(401, 'Please sign in to continue.')
    const ctx: Ctx = { db, deferred: [] }

    const run = await als.run(ctx, async () => {
      // Time-based rules (expiry, reminders, erasure) settle before anything is read.
      await api.runScheduledJobs()
      let result: Result<unknown>
      if (fn === 'completeSignIn') result = await completeSignIn(caller!, args[0], deps)
      else if (fn === 'listNotifications') result = await api.listNotifications(rows.me!)
      else if (fn === 'markNotificationsRead') result = await api.markNotificationsRead(rows.me!)
      else result = await (api as unknown as Record<string, Fn>)[fn](...(args as never[]))
      // Story writing and similar work finish before we save and reply.
      while (ctx.deferred.length) await Promise.all(ctx.deferred.splice(0))
      return result
    })

    if (run === RELINKED) continue
    const ops = diffDb(ctx.db, snapshot, ctx.db.slots.A.user_id)
    try {
      if (ops.length) await deps.gateway.commit(ops)
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) continue
      if (e instanceof ConflictError) return fail(400, 'Your partner changed something at the same moment. Please try again.')
      throw e
    }
    return { result: run as Result<unknown>, client: { pending_invite: ctx.db.slots.A.pending_invite } }
  }
}

function findMe(rows: { me: string | null; users?: { id: string; data: unknown }[] }, authId: string | undefined): string | null {
  if (!authId) return null
  return rows.users?.find((r) => (r.data as { auth_id?: string }).auth_id === authId)?.id ?? null
}

const RELINKED = { ok: false, error: { code: 409, message: 'relinked' } } as unknown as Result<unknown>

/**
 * After the emailed code is verified: sign in to the existing profile, or
 * create one. A new account still needs the 18+ confirmation.
 */
async function completeSignIn(caller: Caller, input: unknown, deps: RpcDeps): Promise<Result<unknown>> {
  const is18 = caller.is_18_confirmed === true || (!!input && typeof input === 'object' && (input as { is_18_confirmed?: unknown }).is_18_confirmed === true)
  const db: Db = readDb()
  const meId = activeSession(db).user_id
  if (meId) {
    transact((d) => track(d, 'login_completed', { user_id: meId }))
    return { ok: true, data: structuredClone(db.users.find((u) => u.user_id === meId)) }
  }
  const email = caller.email.toLowerCase()
  // A profile with this email from an earlier sign-in: attach it and load again.
  if (await deps.gateway.accountExists(email)) {
    await deps.gateway.linkAuth(email, caller.auth_id)
    return RELINKED
  }
  if (!is18) return { ok: false, error: { code: 400, message: "You're new here. Confirm you're 18 or older and we'll create your account.", new_account: true } }
  const user = { ...newUserRecord(email, true), auth_id: caller.auth_id }
  transact((d) => {
    d.users.push(user)
    d.slots.A.user_id = user.user_id
    track(d, 'signup_completed', { user_id: user.user_id })
  })
  return { ok: true, data: structuredClone(user) }
}
