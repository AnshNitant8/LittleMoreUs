// Turns the rows one request loaded from Postgres into the in-memory `Db` the
// service layer already works on, and turns the changes back into a list of
// versioned saves. The service rules themselves do not change.

import { DEFAULT_FLAGS } from '../src/domain/constants'
import { createEmptyDb, emptySlot, type Db } from '../src/services/storage'
import { newId } from '../src/utils/id'

export interface Row {
  id: string
  data: unknown
  version: number
}

export type ScopeRows = { me: string | null; analytics?: unknown[] } & Partial<Record<TableName, Row[]>>

/** One versioned save. `v: null` inserts; `data: null` deletes. */
export interface Op {
  t: TableName | 'events'
  id: string
  data: unknown
  v: number | null
  kind?: string
}

type Rec = Record<string, unknown>
const s = (r: Rec, k: string) => String(r[k])

/** Record collections in `Db`, with how each record's id is made. */
const ARRAY_TABLES = {
  users: (r: Rec) => s(r, 'user_id'),
  couples: (r: Rec) => s(r, 'couple_id'),
  invitations: (r: Rec) => s(r, 'token'),
  interactions: (r: Rec) => s(r, 'interaction_id'),
  responses: (r: Rec) => s(r, 'response_id'),
  stories: (r: Rec) => s(r, 'story_id'),
  reactions: (r: Rec) => `${s(r, 'story_id')}|${s(r, 'user_id')}`,
  reports: (r: Rec) => s(r, 'report_id'),
  question_history: (r: Rec) => `${s(r, 'user_id')}|${s(r, 'question_id')}`,
  entitlements: (r: Rec) => s(r, 'entitlement_id'),
  notifications: (r: Rec) => s(r, 'id'),
} as const

type ArrayTable = keyof typeof ARRAY_TABLES
export type TableName = ArrayTable | 'idempotency' | 'skip_counts' | 'export_log' | 'settings'

export const TABLES: TableName[] = [...(Object.keys(ARRAY_TABLES) as ArrayTable[]), 'idempotency', 'skip_counts', 'export_log', 'settings']

export interface Snapshot {
  /** `${table}:${id}` → version and the JSON as loaded. */
  rows: Map<string, { version: number; json: string }>
  /** Owner of each loaded idempotency key. */
  idemOwner: Map<string, string | null>
  analyticsIds: Set<string>
  auditCount: number
}

export interface Built {
  db: Db
  snapshot: Snapshot
}

/** Build the request's `Db`: slot A is the caller (or nobody). */
export function buildDb(rows: ScopeRows, pendingInvite: string | null): Built {
  const db = createEmptyDb()
  const snap: Snapshot = { rows: new Map(), idemOwner: new Map(), analyticsIds: new Set(), auditCount: 0 }
  const keep = (t: TableName, r: Row) => snap.rows.set(`${t}:${r.id}`, { version: r.version, json: JSON.stringify(r.data) })

  for (const t of Object.keys(ARRAY_TABLES) as ArrayTable[]) {
    const list = rows[t] ?? []
    ;(db[t] as unknown[]) = list.map((r) => {
      keep(t, r)
      return structuredClone(r.data)
    })
  }
  for (const r of rows.idempotency ?? []) {
    const { user_id, ...entry } = r.data as Rec
    db.idempotency[r.id] = entry as Db['idempotency'][string]
    snap.idemOwner.set(r.id, (user_id as string | null) ?? null)
    keep('idempotency', { ...r, data: entry })
  }
  for (const r of rows.skip_counts ?? []) {
    db.skip_counts[r.id] = Number((r.data as Rec).count) || 0
    keep('skip_counts', r)
  }
  for (const r of rows.export_log ?? []) {
    db.export_log[r.id] = String((r.data as Rec).day)
    keep('export_log', r)
  }
  const flags = (rows.settings ?? []).find((r) => r.id === 'flags')
  if (flags) {
    db.flags = { ...DEFAULT_FLAGS, ...(flags.data as Rec) }
    keep('settings', flags)
  }
  db.analytics = (rows.analytics ?? []) as Db['analytics']
  for (const e of db.analytics) snap.analyticsIds.add(e.id)

  db.active_slot = 'A'
  db.slots = { A: { ...emptySlot(), user_id: rows.me, pending_invite: pendingInvite }, B: emptySlot() }
  return { db, snapshot: snap }
}

/** Everything that changed since `buildDb`, as versioned saves. */
export function diffDb(db: Db, snap: Snapshot, callerId: string | null): Op[] {
  const ops: Op[] = []
  const seen = new Set<string>()
  const put = (t: TableName, id: string, data: unknown) => {
    const key = `${t}:${id}`
    seen.add(key)
    const before = snap.rows.get(key)
    if (!before) ops.push({ t, id, data, v: null })
    else if (before.json !== JSON.stringify(data)) ops.push({ t, id, data, v: before.version })
  }

  for (const t of Object.keys(ARRAY_TABLES) as ArrayTable[]) {
    const idOf = ARRAY_TABLES[t] as (r: Rec) => string
    for (const rec of db[t] as unknown as Rec[]) put(t, idOf(rec), rec)
  }
  for (const [k, entry] of Object.entries(db.idempotency)) {
    seen.add(`idempotency:${k}`)
    const before = snap.rows.get(`idempotency:${k}`)
    if (!before) ops.push({ t: 'idempotency', id: k, data: { ...entry, user_id: callerId }, v: null })
    else if (before.json !== JSON.stringify(entry)) ops.push({ t: 'idempotency', id: k, data: { ...entry, user_id: snap.idemOwner.get(k) ?? callerId }, v: before.version })
  }
  for (const [k, count] of Object.entries(db.skip_counts)) put('skip_counts', k, { count })
  for (const [k, day] of Object.entries(db.export_log)) put('export_log', k, { day })
  if (snap.rows.has('settings:flags') || JSON.stringify(db.flags) !== JSON.stringify(DEFAULT_FLAGS)) put('settings', 'flags', db.flags)

  for (const [key, before] of snap.rows) {
    if (seen.has(key)) continue
    const i = key.indexOf(':')
    ops.push({ t: key.slice(0, i) as TableName, id: key.slice(i + 1), data: null, v: before.version })
  }

  for (const e of db.analytics) if (!snap.analyticsIds.has(e.id)) ops.push({ t: 'events', kind: 'analytics', id: e.id, data: e, v: null })
  for (const a of db.audit_log.slice(snap.auditCount)) ops.push({ t: 'events', kind: 'audit', id: newId('aud'), data: a, v: null })
  return ops
}
