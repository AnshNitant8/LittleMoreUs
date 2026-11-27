// Service-layer core: error format, idempotent atomic writes, analytics,
// session helpers, scheduled-jobs runner and Prototype Controls operations.
// The UI imports everything through ./api.ts.

import type {
  AnalyticsEvent,
  ApiError,
  AppNotification,
  DeviceSlot,
  FeatureFlags,
  Result,
  User,
} from '../domain/types'
import { advanceClock as advanceClockRaw, nowIso } from './clock'
import { type Db, readDb, resetDb, storageStatus, transact } from './storage'
import { newId } from '../utils/id'

// ---------- Errors & results ----------

/** Thrown inside a transaction to abort it; converted to a Result by `run`. */
export class ApiFailure extends Error {
  readonly error: ApiError
  constructor(code: ApiError['code'], message: string) {
    super(message)
    this.error = { code, message }
  }
}

export const fail = (code: ApiError['code'], message: string): never => {
  throw new ApiFailure(code, message)
}

function toResult<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (e) {
    if (e instanceof ApiFailure) return { ok: false, error: e.error }
    // Never include payloads in logs: message only.
    console.error('[api] unexpected error', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: { code: 500, message: 'Something went wrong. Please try again.' } }
  }
}

/** Small async boundary so the UI always awaits, as it would with a real backend. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

/** Read-only operation. */
export async function query<T>(fn: (db: Db) => T): Promise<Result<T>> {
  await tick()
  return toResult(() => fn(readDb()))
}

/**
 * Write operation. Runs atomically and is idempotent: a repeated call with the
 * same key returns the first result and performs no further changes.
 */
export async function mutate<T>(idempotencyKey: string, fn: (db: Db) => T): Promise<Result<T>> {
  await tick()
  if (!idempotencyKey) return { ok: false, error: { code: 400, message: 'Missing idempotency key.' } }
  const existing = readDb().idempotency[idempotencyKey]
  if (existing !== undefined) return existing as Result<T>
  const result = toResult(() =>
    transact((db) => {
      const data = fn(db)
      db.idempotency[idempotencyKey] = { ok: true, data }
      return data
    }),
  )
  return result
}

/**
 * Write whose failures must still be saved (e.g. a wrong OTP increments the
 * failed-attempt counter). `fn` returns a Result instead of throwing; the
 * draft is committed either way. Thrown ApiFailures still roll back.
 */
export async function mutateCommitting<T>(idempotencyKey: string, fn: (db: Db) => Result<T>): Promise<Result<T>> {
  await tick()
  if (!idempotencyKey) return { ok: false, error: { code: 400, message: 'Missing idempotency key.' } }
  const existing = readDb().idempotency[idempotencyKey]
  if (existing !== undefined) return existing as Result<T>
  const res = toResult(() =>
    transact((db) => {
      const r = fn(db)
      if (r.ok) db.idempotency[idempotencyKey] = r
      return r
    }),
  )
  return res.ok ? res.data : res
}

export const err = <T = never>(code: ApiError['code'], message: string): Result<T> => ({ ok: false, error: { code, message } })

export function idemKey(action: string): string {
  return `${action}:${newId('k')}`
}

// ---------- Analytics (metadata only) ----------

type AnalyticsValue = string | number | boolean | null

/**
 * Record an analytics event. Only IDs, categories, enums and booleans are
 * allowed: string props longer than 64 chars or containing spaces are dropped
 * as a guard against answer text leaking into analytics.
 */
export function track(db: Db, name: string, props: Record<string, AnalyticsValue> = {}) {
  const safe: Record<string, AnalyticsValue> = {}
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string' && (v.length > 64 || /\s/.test(v))) continue
    safe[k] = v
  }
  const evt: AnalyticsEvent = { id: newId('evt'), name, at: nowIso(), props: safe }
  db.analytics.push(evt)
  if (db.analytics.length > 500) db.analytics.splice(0, db.analytics.length - 500)
}

// ---------- Session helpers ----------

export function activeSession(db: Db) {
  return db.slots[db.active_slot]
}

export function currentUser(db: Db): User | null {
  const id = activeSession(db).user_id
  return (id && db.users.find((u) => u.user_id === id)) || null
}

export function requireUser(db: Db): User {
  return currentUser(db) ?? fail(401, 'Please sign in to continue.')
}

// ---------- Scheduled jobs ----------

export interface JobSummary {
  ran_at: string
  [job: string]: number | string
}

type Job = (db: Db) => number
/** Jobs are registered by later stages: expiry, reminders, Recent cleanup, purges. */
const jobs: Record<string, Job> = {}

export function registerJob(name: string, job: Job) {
  jobs[name] = job
}

/** Runs on app load, on every user switch and on every simulated-clock change. */
export async function runScheduledJobs(): Promise<Result<JobSummary>> {
  await tick()
  return toResult(() =>
    transact((db) => {
      const summary: JobSummary = { ran_at: nowIso() }
      for (const [name, job] of Object.entries(jobs)) summary[name] = job(db)
      return summary
    }),
  )
}

// ---------- Prototype Controls ----------

export interface PrototypeState {
  active_slot: DeviceSlot
  slot_users: Record<DeviceSlot, { user_id: string; display_name: string; identifier: string } | null>
  now: string
  flags: FeatureFlags
  storage: { persistent: boolean; recoveredFromInvalid: boolean }
}

export async function getPrototypeState(): Promise<Result<PrototypeState>> {
  return query((db) => {
    const slotUser = (slot: DeviceSlot) => {
      const u = db.users.find((x) => x.user_id === db.slots[slot].user_id)
      return u ? { user_id: u.user_id, display_name: u.display_name, identifier: u.identifier } : null
    }
    return {
      active_slot: db.active_slot,
      slot_users: { A: slotUser('A'), B: slotUser('B') },
      now: nowIso(),
      flags: { ...db.flags },
      storage: storageStatus(),
    }
  })
}

export async function switchUser(slot: DeviceSlot): Promise<Result<DeviceSlot>> {
  await tick()
  const res = toResult(() =>
    transact((db) => {
      db.active_slot = slot
      track(db, 'prototype_switch_user', { slot })
      return slot
    }),
  )
  await runScheduledJobs()
  return res
}

export async function advanceClock(hours: number): Promise<Result<string>> {
  await tick()
  if (![1, 24, 120, 168].includes(hours)) return { ok: false, error: { code: 400, message: 'Unsupported step.' } }
  advanceClockRaw(hours * 3_600_000)
  await runScheduledJobs()
  return { ok: true, data: nowIso() }
}

export async function updateFlags(patch: Partial<FeatureFlags>): Promise<Result<FeatureFlags>> {
  await tick()
  return toResult(() =>
    transact((db) => {
      const next = { ...db.flags, ...patch }
      if (next.free_window_days !== 5 && next.free_window_days !== 30) fail(400, 'free_window_days must be 5 or 30.')
      const ints: (keyof FeatureFlags)[] = [
        'daily_cap', 'suggestions_per_day', 'expiry_days', 'recent_days', 'invite_expiry_days', 'reminder_delay_hours',
      ]
      for (const k of ints) {
        const v = next[k] as number
        if (!Number.isInteger(v) || v < 0 || v > 1000) fail(400, `${k} must be a whole number between 0 and 1000.`)
      }
      db.flags = next
      track(db, 'prototype_flags_updated', { keys: Object.keys(patch).join(',') })
      return { ...next }
    }),
  )
}

/** Inbox for one user: delivered notifications only (deliver_at has passed). */
export async function listNotifications(userId?: string): Promise<Result<AppNotification[]>> {
  return query((db) => {
    const id = userId ?? activeSession(db).user_id
    if (!id) return []
    const t = nowIso()
    return db.notifications
      .filter((n) => n.user_id === id && n.deliver_at <= t)
      .sort((a, b) => b.deliver_at.localeCompare(a.deliver_at))
  })
}

export async function markNotificationsRead(userId: string): Promise<Result<number>> {
  await tick()
  return toResult(() =>
    transact((db) => {
      const t = nowIso()
      let n = 0
      for (const note of db.notifications) {
        if (note.user_id === userId && !note.read && note.deliver_at <= t) {
          note.read = true
          n++
        }
      }
      return n
    }),
  )
}

export async function listAnalytics(): Promise<Result<AnalyticsEvent[]>> {
  return query((db) => [...db.analytics].reverse())
}

export async function resetAllPrototypeData(): Promise<Result<true>> {
  await tick()
  resetDb()
  await runScheduledJobs()
  return { ok: true, data: true }
}

// ---------- Couple helpers ----------

/** The couple a user is currently paired in, if any. */
export function activeCoupleOf(db: Db, userId: string) {
  return db.couples.find((c) => c.state === 'paired' && c.member_user_ids.includes(userId)) ?? null
}

export function partnerIdOf(couple: { member_user_ids: [string, string] }, userId: string): string {
  return couple.member_user_ids[0] === userId ? couple.member_user_ids[1] : couple.member_user_ids[0]
}
