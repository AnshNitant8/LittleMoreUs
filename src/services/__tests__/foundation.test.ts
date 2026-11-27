import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceClock,
  getPrototypeState,
  mutate,
  registerJob,
  resetAllPrototypeData,
  runScheduledJobs,
  switchUser,
  track,
  updateFlags,
  fail,
} from '../api'
import { nowMs } from '../clock'
import { configureStorage, createLocalStorageAdapter, createMemoryAdapter, parseDb, readDb, SCHEMA_VERSION } from '../storage'

beforeEach(() => {
  configureStorage(createMemoryAdapter())
})

describe('storage resilience', () => {
  it('starts empty when nothing is stored', () => {
    const { db, recovered } = parseDb(null)
    expect(db.users).toEqual([])
    expect(recovered).toBe(false)
  })

  it('recovers from invalid JSON, wrong schema and wrong shapes', () => {
    expect(parseDb('{not json').recovered).toBe(true)
    expect(parseDb(JSON.stringify({ schema_version: 999 })).recovered).toBe(true)
    expect(parseDb(JSON.stringify({ schema_version: SCHEMA_VERSION, users: 'oops' })).recovered).toBe(true)
    expect(parseDb('null').recovered).toBe(true)
  })

  it('fills missing flags with defaults', () => {
    const { db } = parseDb(JSON.stringify({ schema_version: SCHEMA_VERSION, flags: { cap_enabled: true } }))
    expect(db.flags.cap_enabled).toBe(true)
    expect(db.flags.daily_cap).toBe(3)
  })

  it('keeps working when localStorage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const ad = createLocalStorageAdapter('test-key')
    expect(ad.read()).toBeNull()
    expect(ad.persistent).toBe(false)
    ad.write('{"x":1}')
    expect(ad.read()).toBe('{"x":1}') // in-memory fallback
    get.mockRestore()
    set.mockRestore()
  })
})

describe('simulated clock', () => {
  it('advances only by the supported steps and runs jobs', async () => {
    let runs = 0
    registerJob('test_counter', () => ++runs)
    const before = nowMs()
    const r = await advanceClock(24)
    expect(r.ok).toBe(true)
    expect(nowMs() - before).toBeGreaterThanOrEqual(24 * 3_600_000)
    expect(runs).toBeGreaterThan(0)
    const bad = await advanceClock(3)
    expect(bad.ok).toBe(false)
  })
})

describe('idempotency and atomic writes', () => {
  it('ignores repeated writes with the same key', async () => {
    const a = await mutate('k1', (db) => {
      db.audit_log.push({ actor: 't', action: 'x', target: 'y', timestamp: 'now' })
      return db.audit_log.length
    })
    const b = await mutate('k1', (db) => {
      db.audit_log.push({ actor: 't', action: 'x', target: 'y', timestamp: 'now' })
      return db.audit_log.length
    })
    expect(a).toEqual(b)
    expect(readDb().audit_log).toHaveLength(1)
  })

  it('rolls back everything when a write fails part-way', async () => {
    const r = await mutate('k2', (db) => {
      db.audit_log.push({ actor: 't', action: 'x', target: 'y', timestamp: 'now' })
      fail(409, 'nope')
    })
    expect(r).toEqual({ ok: false, error: { code: 409, message: 'nope' } })
    expect(readDb().audit_log).toHaveLength(0)
    // a failed attempt does not burn the key
    const again = await mutate('k2', () => 1)
    expect(again.ok).toBe(true)
  })
})

describe('prototype controls', () => {
  it('switches user and persists the active slot', async () => {
    await switchUser('B')
    const s = await getPrototypeState()
    expect(s.ok && s.data.active_slot).toBe('B')
  })

  it('validates and persists flags', async () => {
    expect((await updateFlags({ free_window_days: 7 as 5 })).ok).toBe(false)
    expect((await updateFlags({ cap_enabled: true, free_window_days: 5 })).ok).toBe(true)
    expect(readDb().flags).toMatchObject({ cap_enabled: true, free_window_days: 5, daily_cap: 3 })
  })

  it('reset clears everything', async () => {
    await updateFlags({ cap_enabled: true })
    await resetAllPrototypeData()
    expect(readDb().flags.cap_enabled).toBe(false)
  })

  it('runScheduledJobs returns a summary', async () => {
    const r = await runScheduledJobs()
    expect(r.ok).toBe(true)
  })
})

describe('analytics guard', () => {
  it('drops string props that look like free text', async () => {
    await mutate('k3', (db) => {
      track(db, 'test', { interaction_id: 'int_123', category: 'remember_us', leaked: 'I remember the rain', ok: true })
    })
    const evt = readDb().analytics.at(-1)!
    expect(evt.props).toEqual({ interaction_id: 'int_123', category: 'remember_us', ok: true })
  })
})
