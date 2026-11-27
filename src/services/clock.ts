// Simulated clock. Every time-dependent rule uses now(), never Date.now().
import { readDb, transact } from './storage'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function nowMs(): number {
  return Date.now() + readDb().clock_offset_ms
}

export function now(): Date {
  return new Date(nowMs())
}

export function nowIso(): string {
  return now().toISOString()
}

/** Advance simulated time. Callers (api.ts) run scheduled jobs afterwards. */
export function advanceClock(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return
  transact((db) => {
    db.clock_offset_ms += ms
  })
}

export const DURATION = { HOUR, DAY, MINUTE: 60_000, SECOND: 1000 }
