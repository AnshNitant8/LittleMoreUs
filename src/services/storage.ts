// Persistence boundary. Only the service layer imports this file.
// localStorage is wrapped in try/catch everywhere; when it is unavailable or
// holds invalid data the app falls back to an in-memory copy and keeps working.
// To move to a real backend, replace `StorageAdapter` and keep `transact`.

import { DEFAULT_FLAGS } from '../domain/constants'
import type {
  AnalyticsEvent,
  AppNotification,
  AuditLog,
  Couple,
  DeviceSlot,
  Entitlement,
  FeatureFlags,
  Interaction,
  Invitation,
  OtpChallenge,
  QuestionHistory,
  Reaction,
  Report,
  Response,
  SlotSession,
  Story,
  User,
} from '../domain/types'

export const SCHEMA_VERSION = 1
export const STORAGE_KEY = 'alum:db'

export interface Db {
  schema_version: number
  /** Milliseconds added to real time to produce simulated time. */
  clock_offset_ms: number
  flags: FeatureFlags
  active_slot: DeviceSlot
  slots: Record<DeviceSlot, SlotSession>
  users: User[]
  couples: Couple[]
  invitations: Invitation[]
  interactions: Interaction[]
  responses: Response[]
  stories: Story[]
  reactions: Reaction[]
  reports: Report[]
  question_history: QuestionHistory[]
  entitlements: Entitlement[]
  notifications: AppNotification[]
  analytics: AnalyticsEvent[]
  audit_log: AuditLog[]
  /** Idempotency keys already processed → stored result. */
  idempotency: Record<string, unknown>
  /** Per-user, per-day skip counts: `${user_id}|${day}|${category}` → count */
  skip_counts: Record<string, number>
  export_log: Record<string, string> // user_id → last export local day
  otp_challenges: Record<string, OtpChallenge>
  /** Prototype Controls: pretend the network is down so offline submit can be tested. */
  simulate_offline: boolean
}

export function emptySlot(): SlotSession {
  return { user_id: null, otp: null, drafts: {}, pending_invite: null }
}

export function createEmptyDb(): Db {
  return {
    schema_version: SCHEMA_VERSION,
    clock_offset_ms: 0,
    flags: { ...DEFAULT_FLAGS },
    active_slot: 'A',
    slots: { A: emptySlot(), B: emptySlot() },
    users: [],
    couples: [],
    invitations: [],
    interactions: [],
    responses: [],
    stories: [],
    reactions: [],
    reports: [],
    question_history: [],
    entitlements: [],
    notifications: [],
    analytics: [],
    audit_log: [],
    idempotency: {},
    skip_counts: {},
    export_log: {},
    otp_challenges: {},
    simulate_offline: false,
  }
}

export interface StorageAdapter {
  read(): string | null
  write(value: string): void
  clear(): void
  /** False when the browser refused storage and we are running in memory. */
  readonly persistent: boolean
}

export function createLocalStorageAdapter(key = STORAGE_KEY): StorageAdapter {
  let memory: string | null = null
  let persistent = true
  const ls = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      return null
    }
  }
  return {
    get persistent() {
      return persistent
    },
    read() {
      try {
        const s = ls()
        if (!s) throw new Error('no storage')
        return s.getItem(key)
      } catch {
        persistent = false
        return memory
      }
    },
    write(value) {
      memory = value
      try {
        const s = ls()
        if (!s) throw new Error('no storage')
        s.setItem(key, value)
      } catch {
        persistent = false
      }
    },
    clear() {
      memory = null
      try {
        ls()?.removeItem(key)
      } catch {
        persistent = false
      }
    },
  }
}

export function createMemoryAdapter(initial: string | null = null): StorageAdapter {
  let value = initial
  return {
    persistent: false,
    read: () => value,
    write: (v) => {
      value = v
    },
    clear: () => {
      value = null
    },
  }
}

const ARRAY_KEYS = [
  'users',
  'couples',
  'invitations',
  'interactions',
  'responses',
  'stories',
  'reactions',
  'reports',
  'question_history',
  'entitlements',
  'notifications',
  'analytics',
  'audit_log',
] as const

/** Parse stored JSON defensively. Any structural problem yields a fresh database. */
export function parseDb(raw: string | null): { db: Db; recovered: boolean } {
  if (raw == null) return { db: createEmptyDb(), recovered: false }
  try {
    const parsed = JSON.parse(raw) as Partial<Db>
    if (!parsed || typeof parsed !== 'object' || parsed.schema_version !== SCHEMA_VERSION) {
      return { db: createEmptyDb(), recovered: true }
    }
    const base = createEmptyDb()
    for (const k of ARRAY_KEYS) {
      if (parsed[k] !== undefined && !Array.isArray(parsed[k])) {
        return { db: base, recovered: true }
      }
    }
    const db: Db = {
      ...base,
      ...parsed,
      flags: { ...DEFAULT_FLAGS, ...(parsed.flags ?? {}) },
      slots: {
        A: { ...emptySlot(), ...(parsed.slots?.A ?? {}) },
        B: { ...emptySlot(), ...(parsed.slots?.B ?? {}) },
      },
      active_slot: parsed.active_slot === 'B' ? 'B' : 'A',
      clock_offset_ms: Number.isFinite(parsed.clock_offset_ms) ? (parsed.clock_offset_ms as number) : 0,
    }
    return { db, recovered: false }
  } catch {
    return { db: createEmptyDb(), recovered: true }
  }
}

// ---------- Store singleton ----------

let adapter: StorageAdapter = createLocalStorageAdapter()
let cache: Db | null = null
let recoveredFromInvalid = false
const listeners = new Set<() => void>()

export function configureStorage(next: StorageAdapter) {
  adapter = next
  cache = null
  recoveredFromInvalid = false
}

export function storageStatus() {
  readDb()
  return { persistent: adapter.persistent, recoveredFromInvalid }
}

export function readDb(): Db {
  if (!cache) {
    const { db, recovered } = parseDb(adapter.read())
    cache = db
    recoveredFromInvalid = recovered
  }
  return cache
}

/**
 * Run `fn` against a draft copy and commit only if it returns without
 * throwing. This is what makes multi-step writes (e.g. createInteraction)
 * atomic: either everything is saved or nothing is.
 */
export function transact<T>(fn: (draft: Db) => T): T {
  const draft = structuredClone(readDb())
  const result = fn(draft)
  cache = draft
  adapter.write(JSON.stringify(draft))
  listeners.forEach((l) => l())
  return result
}

export function resetDb() {
  adapter.clear()
  cache = createEmptyDb()
  adapter.write(JSON.stringify(cache))
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
